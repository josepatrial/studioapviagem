// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building, Loader2, UploadCloud, FileUp } from 'lucide-react'; // Added FileUp
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Reverted to alias path
import { getDrivers as fetchOnlineDrivers, addUser, updateUser, deleteUser, getUserData } from '@/services/firestoreService';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser as deleteLocalDbUser,
    LocalUser as DbUser,
    openDB,
    STORE_USERS,
    getLocalUserByEmail,
    getLocalRecordsByRole,
    updateLocalRecord,
    addLocalRecord
} from '@/services/localDbService';
import type { DriverInfo, User as AppUser } from '@/contexts/AuthContext';
import { LoadingSpinner } from '../LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

type Driver = AppUser & { username?: string };

export const Drivers: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loadingDrivers, setLoadingDrivers] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input

    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [base, setBase] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchDriversData = async () => {
            setLoadingDrivers(true);
            let localDriversData: DbUser[] = [];
            try {
                localDriversData = await getLocalRecordsByRole('driver');
                console.log(`[Drivers] Found ${localDriversData.length} drivers locally.`);

                if (localDriversData.length > 0) {
                    setDrivers(localDriversData.map(({ passwordHash, ...driverData }) => driverData as Driver));
                }

                if (localDriversData.length === 0 && navigator.onLine) {
                    console.log("[Drivers] No local drivers found, fetching online...");
                    try {
                        const onlineDriversData = await fetchOnlineDrivers();
                        console.log(`[Drivers] Found ${onlineDriversData.length} drivers online.`);

                        if (onlineDriversData.length > 0) {
                            const savePromises = onlineDriversData.map(async (driver) => {
                                const existingLocal = await getLocalUser(driver.id).catch(() => null);
                                const localUserData: DbUser = {
                                    ...driver,
                                    id: driver.id,
                                    passwordHash: existingLocal?.passwordHash || '', // Keep existing hash or set empty
                                    lastLogin: existingLocal?.lastLogin || new Date().toISOString(),
                                };
                                try {
                                    await saveLocalUser(localUserData);
                                } catch (saveError) {
                                     console.error(`[Drivers] Error saving/updating driver ${driver.id} locally:`, saveError);
                                }
                            });
                            await Promise.all(savePromises);
                            console.log("[Drivers] Updated local DB with online drivers.");
                            setDrivers(onlineDriversData); // Set UI state with fetched drivers
                        } else {
                             setDrivers([]); // No online drivers, set empty
                        }
                    } catch (onlineError: any) {
                        console.error("[Drivers] Error fetching online drivers:", onlineError);
                        toast({ variant: "destructive", title: "Erro Online", description: `Não foi possível carregar motoristas online: ${onlineError.message}` });
                        // If local data was loaded, keep it, otherwise set empty
                        if(localDriversData.length === 0) setDrivers([]);
                    }
                } else if (localDriversData.length === 0 && !navigator.onLine) {
                     console.log("[Drivers] Offline and no local drivers found.");
                     setDrivers([]);
                     toast({ variant: "default", title: "Offline", description: "Nenhum motorista local encontrado. Conecte-se para buscar online." });
                }
            } catch (localError: any) {
                console.error("[Drivers] Error fetching local drivers:", localError);
                // Do not show toast for common errors like "Failed to fetch" if it's just an offline scenario and local data is missing
                if (!(localError.message.includes("Failed to fetch") || localError.message.includes("NetworkError"))) {
                     toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível carregar motoristas locais: ${localError.message}` });
                }
                 setDrivers([]); // Set empty on local error
            } finally {
                setLoadingDrivers(false);
            }
        };
        fetchDriversData();
    }, [toast]);

    // Core logic for creating a new driver
    const _createNewDriver = async (
        driverName: string,
        driverUsername: string | undefined,
        driverEmail: string,
        driverBase: string,
        driverPassword: string
    ): Promise<boolean> => {
        setIsSaving(true);
        let firebaseUserId: string | undefined = undefined;
        try {
            let emailExistsLocally = false;
            let usernameExistsLocally = false;
            try {
                const existingByEmail = await getLocalUserByEmail(driverEmail);
                if (existingByEmail) emailExistsLocally = true;
                if (driverUsername) { // Only check username if provided
                    usernameExistsLocally = drivers.some(d => d.username === driverUsername);
                }
            } catch (checkError) {
                 console.error("[Drivers] Error checking for existing user locally:", checkError);
                 toast({ variant: "destructive", title: "Erro Interno", description: "Não foi possível verificar usuários existentes localmente." });
                 setIsSaving(false);
                 return false;
            }

            if (emailExistsLocally) {
                toast({ variant: "destructive", title: "Erro de Duplicidade", description: `E-mail ${driverEmail} já cadastrado localmente.` });
                setIsSaving(false);
                return false;
            }
            if (usernameExistsLocally && driverUsername) {
                toast({ variant: "destructive", title: "Erro de Duplicidade", description: `Nome de usuário ${driverUsername} já existe localmente.` });
                setIsSaving(false);
                return false;
            }

            if (navigator.onLine && auth) {
                 try {
                     const userCredential = await createUserWithEmailAndPassword(auth, driverEmail, driverPassword);
                     firebaseUserId = userCredential.user.uid;
                     console.log(`[Drivers] Firebase Auth user created: ${firebaseUserId}`);
                 } catch (authError: any) {
                      console.warn(`[Drivers] Firebase Auth user creation failed: ${authError.code}. Proceeding with local creation.`);
                      if (authError.code === 'auth/email-already-in-use') {
                           toast({ variant: "destructive", title: "Erro Online", description: "Este e-mail já está em uso online. Tente um e-mail diferente ou faça login.", duration: 7000 });
                           setIsSaving(false);
                           return false;
                      } else if (authError.code === 'auth/invalid-email') {
                           toast({ variant: "destructive", title: "Erro Online", description: "O formato do e-mail é inválido para cadastro online.", duration: 7000 });
                           setIsSaving(false);
                           return false;
                      } else if (authError.code === 'auth/operation-not-allowed' || authError.code === 'auth/missing-api-key' || authError.code === 'auth/unauthorized-domain' || authError.code === 'auth/configuration-not-found') {
                        toast({ variant: "destructive", title: "Erro Configuração Firebase", description: `(${authError.code}) Verifique as configurações do Firebase.`, duration: 7000 });
                        setIsSaving(false);
                        return false;
                    }
                 }
             } else {
                  console.log("[Drivers] Offline or Auth unavailable, creating user locally only.");
             }

            const userId = firebaseUserId || `local_user_${uuidv4()}`;
            const userDataForDb: Omit<DbUser, 'passwordHash' | 'lastLogin'> = {
                id: userId,
                name: driverName,
                username: driverUsername,
                email: driverEmail,
                base: driverBase.toUpperCase(),
                role: 'driver',
            };

              if (firebaseUserId && navigator.onLine) {
                  try {
                      await addUser(firebaseUserId, userDataForDb); // addUser now accepts Omit<User, 'id'>
                      console.log(`[Drivers] Firestore document created for ${firebaseUserId}`);
                  } catch (firestoreError) {
                      console.error(`[Drivers] Error creating Firestore document for ${firebaseUserId}:`, firestoreError);
                      toast({ variant: "destructive", title: "Erro Online", description: "Falha ao salvar dados do motorista online. A conta local foi criada.", duration: 7000 });
                  }
              }

             const localUserData: DbUser = {
                  ...userDataForDb,
                  passwordHash: await bcrypt.hash(driverPassword, 10),
                  lastLogin: new Date().toISOString(),
             };
             await saveLocalUser(localUserData);
             console.log(`[Drivers] User saved locally with ID: ${userId}`);

            const newDriverUI: Driver = { ...userDataForDb }; // UI object doesn't need passwordHash
            setDrivers(prevDrivers => [newDriverUI, ...prevDrivers].sort((a,b)=> (a.name || '').localeCompare(b.name || '')));
            return true;
        } catch (error: any) {
            console.error("[Drivers] Error in _createNewDriver:", error);
            let description = `Ocorreu um erro ao cadastrar o motorista: ${error.message}`;
            if (!(error.code?.startsWith('auth/'))) { // Avoid double-toasting for Firebase auth errors
                 toast({ variant: "destructive", title: "Erro no Cadastro", description });
            }
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !password || !confirmPassword || !base) { // Username is now optional
            toast({ variant: "destructive", title: "Erro", description: "Nome, E-mail, Senha, Confirmar Senha e Base são obrigatórios." });
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

        const success = await _createNewDriver(name, username || undefined, email, base, password); // Pass username as undefined if empty
        if (success) {
            resetForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado!", description: "Conta criada com sucesso." });
        }
    };

    const handleEditDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDriver) return;
        if (!name || !email || !base) { // Username is optional
            toast({ variant: "destructive", title: "Erro", description: "Nome, E-mail e Base são obrigatórios." });
            return;
        }

         let originalLocalUser: DbUser | null = null;
         try {
             originalLocalUser = await getLocalUser(currentDriver.id);
         } catch (getError) {
              console.error("[Drivers] Error fetching original local user for edit:", getError);
               toast({ variant: "destructive", title: "Erro Interno", description: "Não foi possível encontrar os dados locais originais do motorista." });
              return;
         }

        if (!originalLocalUser) {
              toast({ variant: "destructive", title: "Erro", description: "Motorista original não encontrado localmente." });
              return;
        }

         let emailExists = false;
         let usernameExists = false;
         try {
              const existingByEmail = await getLocalUserByEmail(email);
              if (existingByEmail && existingByEmail.id !== originalLocalUser.id) emailExists = true;
              if (username) { // Only check username if provided and changed
                 usernameExists = drivers.some(d => d.username === username && d.id !== originalLocalUser!.id);
              }
         } catch (checkError) {
              console.error("[Drivers] Error checking for existing user locally during edit:", checkError);
               toast({ variant: "destructive", title: "Erro", description: "Não foi possível verificar usuários existentes localmente." });
              return;
         }

        if (emailExists) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já pertence a outro motorista localmente." });
            return;
        }
        if (usernameExists && username) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já pertence a outro motorista localmente." });
            return;
        }

        setIsSaving(true);
        try {
            const dataToUpdate: Partial<Omit<DbUser, 'id' | 'passwordHash' | 'lastLogin'>> = {
                name,
                username: username || undefined, // Set to undefined if empty string
                email,
                base: base.toUpperCase(),
                role: 'driver', // Role is fixed for drivers in this context
            };

            // Prevent email change for non-local users directly here
            if (originalLocalUser.id.startsWith('local_') === false && email !== originalLocalUser.email) {
                 toast({ variant: "destructive", title: "Aviso", description: "Alteração de e-mail para contas online deve ser feita no perfil do motorista." });
                 setEmail(originalLocalUser.email); // Revert email change
                 setIsSaving(false);
                 return;
            }

            const updatedLocalData: DbUser = {
                ...originalLocalUser,
                ...dataToUpdate,
                lastLogin: new Date().toISOString(),
                // Password hash is not updated here
            };

            await saveLocalUser(updatedLocalData); // saveLocalUser handles put operation

            const updatedDriverUI = { ...updatedLocalData } as Driver; // Cast to UI type
            delete (updatedDriverUI as any).passwordHash; // Remove hash from UI object

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

    const handleDeleteDriver = async (driverId: string) => {
        setIsSaving(true);
        try {
            const localUserToDelete = await getLocalUser(driverId);
             if (!localUserToDelete) {
                 toast({ variant: "destructive", title: "Erro", description: "Motorista não encontrado localmente para exclusão." });
                 setIsSaving(false);
                 return;
             }
            // Mark for deletion in local DB
            await deleteLocalDbUser(driverId); // This function should mark as deleted
            console.log(`[Drivers] Driver ${driverId} marked for deletion locally.`);
            setDrivers(prevDrivers => prevDrivers.filter(d => d.id !== driverId));
            toast({ title: "Motorista marcado para exclusão.", description: "A exclusão online ocorrerá na próxima sincronização." });
            if (currentDriver?.id === driverId) { // If editing the driver being deleted
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
        setPassword(''); // Clear password fields for edit
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

    const handleExportToExcel = () => {
        if (!drivers || drivers.length === 0) {
            toast({ variant: 'default', title: 'Nenhum dado', description: 'Não há motoristas para exportar.' });
            return;
        }

        // Define which fields to export. Password is intentionally excluded.
        const fieldsToExport: (keyof Driver)[] = ['name', 'username', 'email', 'base'];
        const headerRow = fieldsToExport.join(',');

        const dataToExport = drivers.map(driver => {
            return fieldsToExport.map(field => {
                let cellValue = driver[field] === null || driver[field] === undefined ? '' : String(driver[field]);
                // Escape double quotes and handle commas/newlines for CSV
                cellValue = cellValue.replace(/"/g, '""');
                if (cellValue.search(/("|,|\n)/g) >= 0) {
                    cellValue = `"${cellValue}"`;
                }
                return cellValue;
            }).join(',');
        });

        const csvContent = headerRow + '\n' + dataToExport.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'motoristas_export.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: 'Exportado!', description: 'Os dados dos motoristas foram exportados. Adicione uma coluna "SenhaTemporaria" se desejar importar com senhas iniciais.' });
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: 'Seu navegador não suporta a exportação direta de arquivos.' });
        }
    };

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            toast({ variant: 'destructive', title: 'Nenhum arquivo selecionado.' });
            return;
        }
        if (file.type !== 'text/csv') {
            toast({ variant: 'destructive', title: 'Tipo de arquivo inválido.', description: 'Por favor, selecione um arquivo CSV.' });
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const csvString = e.target?.result as string;
            if (csvString) {
                await processImportedCsv(csvString);
            } else {
                toast({ variant: 'destructive', title: 'Erro ao ler arquivo.' });
            }
        };
        reader.onerror = () => {
            toast({ variant: 'destructive', title: 'Erro ao ler arquivo.' });
        };
        reader.readAsText(file);
        // Reset file input to allow importing the same file again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const processImportedCsv = async (csvString: string) => {
        const lines = csvString.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            toast({ variant: 'destructive', title: 'Arquivo CSV inválido', description: 'O arquivo deve conter um cabeçalho e pelo menos uma linha de dados.' });
            return;
        }

        const header = lines[0].split(',').map(h => h.trim().toLowerCase()); // Standardize header casing
        const nameIndex = header.indexOf('nome'); // Match lowercase
        const usernameIndex = header.indexOf('nome de usuário'); // Match lowercase
        const emailIndex = header.indexOf('e-mail'); // Match lowercase
        const baseIndex = header.indexOf('base'); // Match lowercase
        const tempPasswordIndex = header.indexOf('senhatemporaria'); // Match lowercase and no space

        if (nameIndex === -1 || emailIndex === -1 || baseIndex === -1) {
            toast({ variant: 'destructive', title: 'Cabeçalho CSV inválido', description: `Esperado: nome, e-mail, base (opcional: nome de usuário, senhatemporaria). Verifique o arquivo de exemplo.` });
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        setIsSaving(true); // Set saving state for the entire import process

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const driverName = values[nameIndex];
            const driverUsername = usernameIndex !== -1 ? values[usernameIndex] : undefined; // Handle optional username
            const driverEmail = values[emailIndex];
            const driverBase = values[baseIndex];
            const driverPassword = tempPasswordIndex !== -1 && values[tempPasswordIndex] ? values[tempPasswordIndex] : "password@123"; // Default password

            if (!driverName || !driverEmail || !driverBase) {
                errors.push(`Linha ${i + 1}: Campos obrigatórios (Nome, E-mail, Base) faltando.`);
                errorCount++;
                continue;
            }
             // Basic email validation
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail)) {
                errors.push(`Linha ${i + 1}: Formato de e-mail inválido para ${driverEmail}.`);
                errorCount++;
                continue;
            }

            const created = await _createNewDriver(driverName, driverUsername, driverEmail, driverBase, driverPassword);
            if (created) {
                successCount++;
            } else {
                errorCount++;
                // _createNewDriver already shows a toast for specific creation errors, so we just count here.
            }
        }
        setIsSaving(false); // Reset saving state

        if (successCount > 0) {
            toast({ title: 'Importação Concluída', description: `${successCount} motorista(s) importado(s) com sucesso.` });
        }
        if (errorCount > 0) {
            toast({
                variant: 'destructive',
                title: 'Erros na Importação',
                description: `${errorCount} linha(s) não puderam ser importadas. ${errors.length > 0 ? `Detalhes: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}` : ''}`,
                duration: 10000
            });
        }
        if (successCount === 0 && errorCount === 0 && lines.length > 1) { // If there were data lines but no success/errors (e.g., all duplicates)
            toast({ variant: 'default', title: 'Importação', description: 'Nenhum motorista novo para importar ou todos já existem.' });
        }
    };


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">Gerenciar Motoristas</h2>
                <div className="flex gap-2">
                    <Button onClick={handleExportToExcel} variant="outline" className="text-primary-foreground bg-primary/90 hover:bg-primary/80" disabled={isSaving}>
                        <UploadCloud className="mr-2 h-4 w-4" /> Exportar para Excel
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileImport}
                        accept=".csv"
                        className="hidden"
                        id="import-csv-input"
                    />
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="text-primary-foreground bg-green-600 hover:bg-green-700" disabled={isSaving}>
                        <FileUp className="mr-2 h-4 w-4" /> Importar de Excel
                    </Button>
                    <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => !isOpen && closeCreateModal()}>
                        <DialogTrigger asChild>
                            <Button onClick={() => { resetForm(); setIsCreateModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
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
                                    <Label htmlFor="username">Nome de Usuário (Opcional)</Label>
                                    <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ex: joao.silva" disabled={isSaving} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">E-mail*</Label>
                                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="motorista@email.com" disabled={isSaving} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="base">Base*</Label>
                                    <Input id="base" value={base} onChange={(e) => setBase(e.target.value.toUpperCase())} required placeholder="Base de operação (Ex: SP, RJ)" disabled={isSaving}/>
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
                                         <Building className="h-3 w-3" /> Base: {driver.base || 'Sem base'}
                                     </CardDescription>
                                </div>
                                <div className="flex gap-1">
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
                                                    <Label htmlFor="editUsername">Nome de Usuário (Opcional)</Label>
                                                    <Input id="editUsername" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isSaving}/>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editEmail">E-mail*</Label>
                                                    <Input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                                        disabled={isSaving || (driver && !driver.id.startsWith('local_'))} // Disable email edit for non-local (Firebase) users
                                                        title={(driver && !driver.id.startsWith('local_')) ? "Alteração de e-mail deve ser feita pelo perfil do motorista." : ""}
                                                    />
                                                     {(driver && !driver.id.startsWith('local_')) && (
                                                        <p className="text-xs text-muted-foreground">Alteração de e-mail indisponível aqui para contas online.</p>
                                                      )}
                                                </div>
                                                 <div className="space-y-2">
                                                    <Label htmlFor="editBase">Base*</Label>
                                                    <Input id="editBase" value={base} onChange={(e) => setBase(e.target.value.toUpperCase())} required disabled={isSaving} />
                                                 </div>
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
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
