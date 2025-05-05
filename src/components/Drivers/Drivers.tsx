// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building, Loader2 } from 'lucide-react'; // Added Building icon for Base, Loader2
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'; // Import Firebase Auth functions
import { auth } from '@/lib/firebase'; // Import initialized Firebase auth
import { getDrivers as fetchOnlineDrivers, addUser, updateUser, deleteUser, getUserData } from '@/services/firestoreService'; // Rename online fetch
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser as deleteLocalDbUser, // Rename local delete
    LocalUser as DbUser, // Use DbUser alias
    openDB,
    STORE_USERS,
    getLocalUserByEmail,
    getLocalRecordsByRole, // Import function to get users by role
    updateLocalRecord, // Import for updating local DB after online fetch
    addLocalRecord // Import for potentially adding users from online fetch
} from '@/services/localDbService';
import type { DriverInfo, User as AppUser } from '@/contexts/AuthContext'; // Import types
import { LoadingSpinner } from '../LoadingSpinner'; // Import LoadingSpinner
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs'; // Import bcrypt

// Driver interface now uses DriverInfo which extends User
type Driver = AppUser & { username?: string }; // Username optional

export const Drivers: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loadingDrivers, setLoadingDrivers] = useState(true); // Loading state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
    const { toast } = useToast();

    // --- Form State for Create/Edit ---
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [base, setBase] = useState('');
    const [isSaving, setIsSaving] = useState(false); // Loading state for save/edit/delete actions

    // Fetch drivers on mount - Prioritize Local DB
    useEffect(() => {
        const fetchDriversData = async () => {
            setLoadingDrivers(true);
            let localDriversData: DbUser[] = [];
            try {
                // 1. Fetch from Local DB first
                localDriversData = await getLocalRecordsByRole('driver');
                console.log(`[Drivers] Found ${localDriversData.length} drivers locally.`);

                if (localDriversData.length > 0) {
                    // Map DbUser to Driver for UI, excluding passwordHash
                    setDrivers(localDriversData.map(({ passwordHash, ...driverData }) => driverData as Driver));
                }

                // 2. Fetch from Firestore only if local is empty AND online
                if (localDriversData.length === 0 && navigator.onLine) {
                    console.log("[Drivers] No local drivers found, fetching online...");
                    try {
                        const onlineDriversData = await fetchOnlineDrivers(); // Fetch DriverInfo directly
                        console.log(`[Drivers] Found ${onlineDriversData.length} drivers online.`);

                        if (onlineDriversData.length > 0) {
                            // Update local DB with online data
                            const savePromises = onlineDriversData.map(async (driver) => {
                                const existingLocal = await getLocalUser(driver.id).catch(() => null); // Try to get existing local user by firebase ID
                                const localUserData: DbUser = {
                                    ...driver, // Spread DriverInfo
                                    id: driver.id, // Firestore ID is the main key
                                    // Preserve existing local password hash if found, otherwise empty
                                    passwordHash: existingLocal?.passwordHash || '',
                                    lastLogin: existingLocal?.lastLogin || new Date().toISOString(), // Preserve last login or set new
                                };
                                // Upsert into local DB
                                try {
                                    await saveLocalUser(localUserData);
                                } catch (saveError) {
                                     console.error(`[Drivers] Error saving/updating driver ${driver.id} locally:`, saveError);
                                     // Potentially retry or just log
                                }
                            });
                            await Promise.all(savePromises);
                            console.log("[Drivers] Updated local DB with online drivers.");
                            // Set UI state from online data
                            setDrivers(onlineDriversData);
                        } else {
                            setDrivers([]); // Set empty if both local and online are empty
                        }
                    } catch (onlineError: any) {
                        console.error("[Drivers] Error fetching online drivers:", onlineError);
                        if (localDriversData.length === 0) { // Only toast if local was also empty
                            toast({ variant: "destructive", title: "Erro Online", description: `Não foi possível carregar motoristas online.` });
                        }
                        // Stick with empty local data if online fetch fails
                        setDrivers([]);
                    }
                } else if (localDriversData.length === 0 && !navigator.onLine) {
                     console.log("[Drivers] Offline and no local drivers found.");
                     setDrivers([]); // Explicitly set empty state
                     toast({ variant: "default", title: "Offline", description: "Nenhum motorista local encontrado. Conecte-se para buscar online." });
                }

            } catch (localError: any) {
                console.error("[Drivers] Error fetching local drivers:", localError);
                // Use a generic error message for local fetch errors
                toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível carregar motoristas locais. Verifique o console.` });
                setDrivers([]); // Set empty on local error
            } finally {
                setLoadingDrivers(false);
            }
        };
        fetchDriversData();
    }, [toast]); // Dependency array

    // --- Handlers ---
    const handleAddDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !username || !email || !password || !confirmPassword || !base) {
            toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
            return;
        }
        if (password !== confirmPassword) {
             toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
             return;
        }
        if (password.length < 6) {
            toast({ variant: "destructive", title: "Erro", description: "A senha deve ter pelo menos 6 caracteres." });
            return;
         }

        // Check if username or email already exists locally
        let emailExists = false;
        let usernameExists = false;
        try {
            const existingByEmail = await getLocalUserByEmail(email);
            if (existingByEmail) emailExists = true;
            // Check username if it's stored/needed locally (requires index or fetching all)
            // For simplicity, we'll re-use the UI state check for username here, but a DB check is better
            usernameExists = drivers.some(d => d.username === username);
        } catch (checkError) {
             console.error("[Drivers] Error checking for existing user locally:", checkError);
             // Proceed cautiously or halt? Let's halt for safety.
             toast({ variant: "destructive", title: "Erro", description: "Não foi possível verificar usuários existentes localmente." });
             return;
        }


        if (emailExists) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já cadastrado localmente." });
            return;
        }
        if (usernameExists) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já existe localmente." });
            return;
        }

        setIsSaving(true);
        let firebaseUserId: string | undefined = undefined;
        try {
            // 1. Create user in Firebase Authentication (Only if online)
             if (navigator.onLine && auth) {
                 try {
                     const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                     firebaseUserId = userCredential.user.uid;
                     console.log(`[Drivers] Firebase Auth user created: ${firebaseUserId}`);
                 } catch (authError: any) {
                      console.warn(`[Drivers] Firebase Auth user creation failed: ${authError.code}. Proceeding with local creation.`);
                      // Handle specific errors if needed (e.g., email-already-in-use online)
                      if (authError.code === 'auth/email-already-in-use') {
                           toast({ variant: "destructive", title: "Erro Online", description: "Este e-mail já está em uso online. Tente um e-mail diferente ou faça login.", duration: 7000 });
                           setIsSaving(false);
                           return; // Stop if email is taken online
                      } else if (authError.code === 'auth/invalid-email') {
                           toast({ variant: "destructive", title: "Erro Online", description: "O formato do e-mail é inválido para cadastro online.", duration: 7000 });
                           setIsSaving(false);
                           return; // Stop if email is invalid for Firebase
                      }
                      // Otherwise, let local creation proceed but warn user
                      toast({ variant: "destructive", title: "Aviso Online", description: `Falha ao criar usuário online (${authError.code}). O usuário será criado apenas localmente.`, duration: 7000 });
                 }
             } else {
                  console.log("[Drivers] Offline or Auth unavailable, creating user locally only.");
             }

            // 2. Determine User ID (Firebase ID if created, otherwise generate local)
            const userId = firebaseUserId || `local_user_${uuidv4()}`;

            // 3. Prepare User Data (for Firestore and Local DB)
            const userDataForDb: Omit<DbUser, 'passwordHash' | 'lastLogin'> = {
                id: userId, // Use the determined ID
                name,
                username,
                email,
                base,
                role: 'driver', // Explicitly set role
            };

             // 4. Create user document in Firestore (Only if Firebase user was created)
             let firestoreDocCreated = false;
              if (firebaseUserId && navigator.onLine) {
                  try {
                      // Use setDoc with merge:true to be safe, using the Firebase UID
                      await addUser(firebaseUserId, userDataForDb);
                      firestoreDocCreated = true;
                      console.log(`[Drivers] Firestore document created for ${firebaseUserId}`);
                  } catch (firestoreError) {
                      console.error(`[Drivers] Error creating Firestore document for ${firebaseUserId}:`, firestoreError);
                      toast({ variant: "destructive", title: "Erro Online", description: "Falha ao salvar dados do motorista online. A conta local foi criada.", duration: 7000 });
                      // Proceed with local save, but the online state is inconsistent
                  }
              }

             // 5. Save user data locally (DbUser format)
             const localUserData: DbUser = {
                  ...userDataForDb,
                  passwordHash: await bcrypt.hash(password, 10), // Hash password for local storage
                  lastLogin: new Date().toISOString(),
             };
             await saveLocalUser(localUserData);
             console.log(`[Drivers] User saved locally with ID: ${userId}`);

            // 6. Update local UI state
             const newDriverUI: Driver = {
                  ...userDataForDb, // Use data without hash for UI
             };
            setDrivers(prevDrivers => [newDriverUI, ...prevDrivers].sort((a,b)=> (a.name || '').localeCompare(b.name || '')));

            resetForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado!", description: firebaseUserId ? "Conta online e local criadas." : "Conta criada apenas localmente." });

        } catch (error: any) {
            console.error("[Drivers] Error adding driver:", error);
            let description = `Ocorreu um erro ao cadastrar o motorista localmente: ${error.message}`;
            // Specific error handling from previous Firebase attempt might have already shown a toast
            if (!(error.code?.startsWith('auth/'))) { // Avoid duplicate toasts for auth errors handled above
                 toast({ variant: "destructive", title: "Erro no Cadastro", description });
            }
        } finally {
            setIsSaving(false);
        }
    };

    // Handle Edit - Primarily updates local, marks for sync
    const handleEditDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDriver) return;
        if (!name || !username || !email || !base) {
            toast({ variant: "destructive", title: "Erro", description: "Nome, Nome de Usuário, E-mail e Base são obrigatórios." });
            return;
        }

         // Find original local record
         let originalLocalUser: DbUser | null = null;
         try {
             originalLocalUser = await getLocalUser(currentDriver.id); // Assuming currentDriver.id holds the correct key (firebaseId or localId)
         } catch (getError) {
              console.error("[Drivers] Error fetching original local user for edit:", getError);
               toast({ variant: "destructive", title: "Erro Interno", description: "Não foi possível encontrar os dados locais originais do motorista." });
              return;
         }

        if (!originalLocalUser) {
              toast({ variant: "destructive", title: "Erro", description: "Motorista original não encontrado localmente." });
              return;
        }


        // Check for duplicate username/email locally (excluding the current driver)
         let emailExists = false;
         let usernameExists = false;
         try {
              const existingByEmail = await getLocalUserByEmail(email);
              if (existingByEmail && existingByEmail.id !== originalLocalUser.id) emailExists = true;
              // Check username (reusing UI state check for simplicity)
              usernameExists = drivers.some(d => d.username === username && d.id !== originalLocalUser!.id);
         } catch (checkError) {
              console.error("[Drivers] Error checking for existing user locally during edit:", checkError);
               toast({ variant: "destructive", title: "Erro", description: "Não foi possível verificar usuários existentes localmente." });
              return;
         }


        if (emailExists) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já pertence a outro motorista localmente." });
            return;
        }
        if (usernameExists) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já pertence a outro motorista localmente." });
            return;
        }

        setIsSaving(true);
        try {
            const dataToUpdate: Partial<Omit<DbUser, 'id' | 'passwordHash' | 'lastLogin'>> = {
                name,
                username,
                email,
                base,
                role: 'driver', // Ensure role is set
            };

            // Disallow email change if user has a Firebase ID (requires re-auth, handled elsewhere)
            if (originalLocalUser.id.startsWith('local_') === false && email !== originalLocalUser.email) {
                 toast({ variant: "destructive", title: "Aviso", description: "Alteração de e-mail para contas online deve ser feita no perfil do motorista." });
                 setEmail(originalLocalUser.email); // Reset email field
                 setIsSaving(false);
                 return;
            }


            // Prepare updated local data, mark for sync
            const updatedLocalData: DbUser = {
                ...originalLocalUser,
                ...dataToUpdate,
                lastLogin: new Date().toISOString(),
                // syncStatus: 'pending', // Mark for sync - This needs localDbService modification or SyncProvider handling
                 // TODO: Ideally, updateLocalRecord should automatically handle setting syncStatus to 'pending' if needed.
                 // For now, rely on SyncProvider logic or modify localDbService.
            };

            await saveLocalUser(updatedLocalData); // Update local DB

            // Update local UI state
            const updatedDriverUI = { ...updatedLocalData } as Driver; // Assuming UI doesn't need hash
            delete (updatedDriverUI as any).passwordHash; // Ensure hash is removed for UI state

            setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? updatedDriverUI : d).sort((a,b)=> (a.name || '').localeCompare(b.name || '')));

            resetForm();
            setIsEditModalOpen(false);
            setCurrentDriver(null);
            toast({ title: "Dados do motorista atualizados localmente!" });

        } catch (error: any) {
            console.error("[Drivers] Error updating local driver:", error);
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível atualizar os dados locais: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };


    // Handle Delete - Mark for deletion locally, sync handles Firebase deletion
    const handleDeleteDriver = async (driverId: string) => {
        setIsSaving(true);
        try {
            // Find the local record to ensure it exists before marking
            const localUserToDelete = await getLocalUser(driverId);
             if (!localUserToDelete) {
                 toast({ variant: "destructive", title: "Erro", description: "Motorista não encontrado localmente para exclusão." });
                 setIsSaving(false);
                 return;
             }

            // TODO: Add checks for dependencies (e.g., active trips) locally if needed

            // Use the specific local delete function which should mark for deletion
            await deleteLocalDbUser(driverId); // Use the renamed local delete function
            console.log(`[Drivers] Driver ${driverId} marked for deletion locally.`);

            // Update local UI state immediately
            setDrivers(prevDrivers => prevDrivers.filter(d => d.id !== driverId));
            toast({ title: "Motorista marcado para exclusão.", description: "A exclusão online ocorrerá na próxima sincronização." });

            // Close edit modal if the deleted driver was being edited
            if (currentDriver?.id === driverId) {
                 closeEditModal();
            }

        } catch (error: any) {
            console.error("[Drivers] Error marking driver for deletion locally:", error);
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível marcar motorista para exclusão: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };


    const openEditModal = (driver: Driver) => {
        setCurrentDriver(driver);
        setName(driver.name || '');
        setUsername(driver.username || '');
        setEmail(driver.email || '');
        setBase(driver.base || '');
        setPassword(''); // Clear password fields when opening edit modal
        setConfirmPassword('');
        setIsEditModalOpen(true);
    };

    const resetForm = () => {
        setName('');
        setUsername('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setBase('');
    };

    const closeCreateModal = () => {
        resetForm();
        setIsCreateModalOpen(false);
    }

    const closeEditModal = () => {
        resetForm();
        setIsEditModalOpen(false);
        setCurrentDriver(null);
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">Gerenciar Motoristas</h2>
                <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => !isOpen && closeCreateModal()}>
                    <DialogTrigger asChild>
                        <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Motorista
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Cadastrar Novo Motorista</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAddDriver} className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome Completo*</Label>
                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nome do motorista" disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="username">Nome de Usuário*</Label>
                                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Ex: joao.silva" disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail*</Label>
                                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="motorista@email.com" disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="base">Base*</Label>
                                <Input id="base" value={base} onChange={(e) => setBase(e.target.value)} required placeholder="Base de operação (Ex: SP, RJ)" disabled={isSaving}/>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Senha*</Label>
                                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" disabled={isSaving} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirmar Senha*</Label>
                                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Repita a senha" disabled={isSaving} />
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                                </DialogClose>
                                <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                     {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                     {isSaving ? 'Salvando...' : 'Salvar Motorista'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {loadingDrivers ? (
                 <div className="flex justify-center items-center h-40">
                     <LoadingSpinner />
                 </div>
             ) : drivers.length === 0 ? (
                <Card className="text-center py-10 bg-card border border-border shadow-sm rounded-lg">
                    <CardContent>
                        <p className="text-muted-foreground">Nenhum motorista cadastrado localmente.</p>
                        <Button variant="link" onClick={() => {resetForm(); setIsCreateModalOpen(true);}} className="mt-2 text-primary">
                            Cadastrar o primeiro motorista
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {drivers.map((driver) => (
                        <Card key={driver.id} className="shadow-sm transition-shadow hover:shadow-md bg-card border border-border">
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <div>
                                    <CardTitle className="text-lg font-semibold text-primary">{driver.name}</CardTitle>
                                    <CardDescription className="text-sm text-muted-foreground flex items-center gap-1 pt-1">
                                        <Hash className="h-3 w-3" /> {driver.username || 'N/A'}
                                    </CardDescription>
                                     <CardDescription className="text-sm text-muted-foreground flex items-center gap-1">
                                         <Building className="h-3 w-3" /> Base: {driver.base || 'Sem base'} {/* Display if base is missing */}
                                     </CardDescription>
                                </div>
                                <div className="flex gap-1">
                                    {/* Edit Button */}
                                    <Dialog open={isEditModalOpen && currentDriver?.id === driver.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" onClick={() => openEditModal(driver)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Editar Motorista</span>
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-lg">
                                            <DialogHeader>
                                                <DialogTitle>Editar Motorista</DialogTitle>
                                            </DialogHeader>
                                            <form onSubmit={handleEditDriver} className="grid gap-4 py-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="editName">Nome Completo*</Label>
                                                    <Input id="editName" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSaving}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editUsername">Nome de Usuário*</Label>
                                                    <Input id="editUsername" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={isSaving}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editEmail">E-mail*</Label>
                                                    <Input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                                        // Disable if user has a Firebase ID (starts with anything other than 'local_')
                                                        disabled={isSaving || !driver.id.startsWith('local_')}
                                                        title={!driver.id.startsWith('local_') ? "Alteração de e-mail deve ser feita pelo perfil do motorista." : ""}
                                                    />
                                                     {!driver.id.startsWith('local_') && (
                                                        <p className="text-xs text-muted-foreground">Alteração de e-mail indisponível aqui para contas online.</p>
                                                      )}
                                                </div>
                                                 <div className="space-y-2">
                                                    <Label htmlFor="editBase">Base*</Label>
                                                    <Input id="editBase" value={base} onChange={(e) => setBase(e.target.value)} required disabled={isSaving} />
                                                 </div>
                                                {/* Password fields removed from edit for simplicity/security */}
                                                <DialogFooter>
                                                    <DialogClose asChild>
                                                        <Button type="button" variant="outline" onClick={closeEditModal} disabled={isSaving}>Cancelar</Button>
                                                    </DialogClose>
                                                    <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                        {isSaving ? 'Salvando...' : 'Salvar Alterações Locais'}
                                                    </Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>

                                    {/* Delete Button */}
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir Motorista</span>
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Tem certeza que deseja marcar o motorista {driver.name} ({driver.username || 'N/A'}) para exclusão? A exclusão definitiva online ocorrerá na próxima sincronização.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteDriver(driver.id)}
                                                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                                    disabled={isSaving}
                                                >
                                                     {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                     {isSaving ? 'Marcando...' : 'Marcar para Excluir'}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Mail className="h-4 w-4" />
                                    <span>{driver.email}</span>
                                </div>
                                {/* Add more details if needed */}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
