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
import { getDrivers, addUser, updateUser, deleteUser, getUserData } from '@/services/firestoreService'; // Import Firestore service functions
import type { DriverInfo, User as AppUser } from '@/contexts/AuthContext'; // Import types
import { LoadingSpinner } from '../LoadingSpinner'; // Import LoadingSpinner

// Driver interface now uses DriverInfo which extends User
type Driver = AppUser & { username: string }; // Assuming username is still required for display


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

    // Fetch drivers on mount
    useEffect(() => {
        const fetchDrivers = async () => {
            setLoadingDrivers(true);
            try {
                const fetchedDrivers = await getDrivers();
                // Assuming getDrivers returns DriverInfo or compatible User type
                setDrivers(fetchedDrivers as Driver[]); // Cast might be needed depending on service return type
            } catch (error) {
                console.error("Error fetching drivers:", error);
                toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar os motoristas." });
            } finally {
                setLoadingDrivers(false);
            }
        };
        fetchDrivers();
    }, [toast]);

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

        // Check if username or email already exists (query Firestore) - Basic check shown
        // In a real app, use Firestore queries for robust checking
        const emailExists = drivers.some(d => d.email === email);
        const usernameExists = drivers.some(d => d.username === username); // Assuming username is stored/needed

        if (emailExists) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já cadastrado." });
            return;
        }
        if (usernameExists) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já existe." });
            return;
        }

        setIsSaving(true);
        try {
            // 1. Create user in Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userId = userCredential.user.uid;

            // 2. Create user document in Firestore
            const userData: Omit<DriverInfo, 'id' | 'password'> = {
                name,
                username,
                email,
                base,
                role: 'driver', // Set role explicitly
            };
            await addUser(userId, userData); // Use Firestore service

            // 3. Update local state
            const newDriver = { id: userId, ...userData } as Driver;
            setDrivers(prevDrivers => [newDriver, ...prevDrivers]);

            resetForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado com sucesso!" });
        } catch (error: any) {
            console.error("Error adding driver:", error);
            let description = "Ocorreu um erro ao cadastrar o motorista.";
            if (error.code === 'auth/email-already-in-use') {
                description = "Este e-mail já está em uso por outra conta.";
            } else if (error.code === 'auth/invalid-email') {
                description = "O formato do e-mail é inválido.";
            } else if (error.code === 'auth/weak-password') {
                 description = "A senha é muito fraca.";
            }
            toast({ variant: "destructive", title: "Erro", description });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDriver) return;
        if (!name || !username || !email || !base) {
            toast({ variant: "destructive", title: "Erro", description: "Nome, Nome de Usuário, E-mail e Base são obrigatórios." });
            return;
        }

        // Check for duplicate username/email (excluding the current driver)
        const emailExists = drivers.some(d => d.email === email && d.id !== currentDriver.id);
        const usernameExists = drivers.some(d => d.username === username && d.id !== currentDriver.id);

        if (emailExists) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já pertence a outro motorista." });
            return;
        }
        if (usernameExists) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já pertence a outro motorista." });
            return;
        }

        setIsSaving(true);
        try {
            const dataToUpdate: Partial<DriverInfo> = {
                name,
                username,
                email, // Email update needs re-authentication, handle separately or disallow direct edit here
                base,
            };

            // Note: Updating email/password for existing users via admin panel is complex
            // due to Firebase Auth security rules (requires re-authentication).
            // It's often better to have users manage their own credentials via profile page.
            // We'll only update Firestore data here. Password changes are omitted.
            if (email !== currentDriver.email) {
                 toast({ variant: "destructive", title: "Aviso", description: "Alteração de e-mail não suportada aqui. O motorista deve alterar em seu perfil." });
                 // Reset email field or prevent saving if email changed
                 //setEmail(currentDriver.email);
                 //return;
            }


            await updateUser(currentDriver.id, dataToUpdate); // Use Firestore service

            // Update local state
            const updatedDriver = { ...currentDriver, ...dataToUpdate } as Driver;
            setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? updatedDriver : d));

            resetForm();
            setIsEditModalOpen(false);
            setCurrentDriver(null);
            toast({ title: "Dados do motorista atualizados com sucesso!" });

        } catch (error) {
            console.error("Error updating driver:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar os dados do motorista." });
        } finally {
            setIsSaving(false);
        }
    };


    const handleDeleteDriver = async (driverId: string) => {
         // Add checks here if needed (e.g., cannot delete if driver has active trips)
         // This requires fetching trip data, which adds complexity.

        setIsSaving(true);
        try {
            // 1. Delete Firestore document
            await deleteUser(driverId); // Use Firestore service

            // 2. Delete Firebase Auth user (REQUIRES ADMIN SDK on backend, not possible client-side directly)
            //    For now, we only delete from Firestore and local state.
            //    The Auth user will remain but won't have associated data.
            console.warn(`Driver ${driverId} deleted from Firestore. Corresponding Auth user NOT deleted (requires backend).`);

            // 3. Update local state
            setDrivers(prevDrivers => prevDrivers.filter(d => d.id !== driverId));
            toast({ title: "Motorista excluído do banco de dados." });
        } catch (error) {
            console.error("Error deleting driver:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir o motorista." });
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
                <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
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
                        <p className="text-muted-foreground">Nenhum motorista cadastrado.</p>
                        <Button variant="link" onClick={() => setIsCreateModalOpen(true)} className="mt-2 text-primary">
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
                                        <Hash className="h-3 w-3" /> {driver.username}
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
                                                    <Input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={true} // Disable email editing client-side for now
                                                           title="Alteração de e-mail deve ser feita pelo perfil do motorista."
                                                     />
                                                      <p className="text-xs text-muted-foreground">Alteração de e-mail indisponível aqui.</p>
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
                                                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
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
                                                    Tem certeza que deseja excluir o motorista {driver.name} ({driver.username})? Esta ação removerá o registro do sistema, mas o login associado pode precisar ser removido manualmente pelo administrador do Firebase.
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
                                                     {isSaving ? 'Excluindo...' : 'Excluir'}
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
