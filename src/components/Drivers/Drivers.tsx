// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building } from 'lucide-react'; // Added Building icon for Base
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { initialDrivers } from '@/contexts/AuthContext'; // Import mock drivers

// Define the Driver interface locally or import if shared
interface Driver {
    id: string;
    name: string;
    username: string;
    email: string;
    base: string;
    // password is not stored/displayed directly for security
}


export const Drivers: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
    const { toast } = useToast();

    // --- Form State for Create/Edit ---
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(''); // Only for create/edit, not stored in state
    const [confirmPassword, setConfirmPassword] = useState(''); // For create/edit password validation
    const [base, setBase] = useState('');

    useEffect(() => {
        // Load initial drivers (in real app, fetch from API)
        setDrivers(initialDrivers);
    }, []);

    // --- Handlers ---
    const handleAddDriver = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !username || !email || !password || !confirmPassword || !base) {
            toast({ variant: "destructive", title: "Erro", description: "Todos os campos são obrigatórios." });
            return;
        }
        if (password !== confirmPassword) {
             toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
             return;
        }
        // Add basic password complexity check if needed (e.g., length)
         if (password.length < 6) {
            toast({ variant: "destructive", title: "Erro", description: "A senha deve ter pelo menos 6 caracteres." });
            return;
         }
        // Check if username or email already exists (simple check on mock data)
        if (drivers.some(d => d.username === username)) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já existe." });
            return;
        }
        if (drivers.some(d => d.email === email)) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já cadastrado." });
            return;
        }

        const newDriver: Driver = {
            id: String(Date.now()), // Simple unique ID
            name,
            username,
            email,
            base,
            // password is sent to backend, not stored directly in frontend state array
        };
        // In a real app, save to backend (sending the password)
        initialDrivers.push(newDriver); // Add to global mock data
        setDrivers(prevDrivers => [newDriver, ...prevDrivers]); // Update local state
        resetForm();
        setIsCreateModalOpen(false);
        toast({ title: "Motorista cadastrado com sucesso!" });
        // Clear password fields after successful creation
        setPassword('');
        setConfirmPassword('');
    };

    const handleEditDriver = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDriver) return;
        if (!name || !username || !email || !base) {
            toast({ variant: "destructive", title: "Erro", description: "Nome, Nome de Usuário, E-mail e Base são obrigatórios." });
            return;
        }
        // Password update logic (optional during edit)
        if (password && password !== confirmPassword) {
             toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
             return;
        }
         if (password && password.length < 6) {
            toast({ variant: "destructive", title: "Erro", description: "A nova senha deve ter pelo menos 6 caracteres." });
            return;
         }

        // Check for duplicate username/email (excluding the current driver)
        if (drivers.some(d => d.username === username && d.id !== currentDriver.id)) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já existe." });
            return;
        }
        if (drivers.some(d => d.email === email && d.id !== currentDriver.id)) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já cadastrado." });
            return;
        }

        const updatedDriver: Driver = {
            ...currentDriver,
            name,
            username,
            email,
            base,
        };

        // In a real app, save to backend (send password only if changed)
        const index = initialDrivers.findIndex(d => d.id === currentDriver.id);
        if (index !== -1) {
            initialDrivers[index] = updatedDriver; // Update global mock data
        }

        setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? updatedDriver : d)); // Update local state
        resetForm();
        setIsEditModalOpen(false);
        setCurrentDriver(null);
        toast({ title: "Dados do motorista atualizados com sucesso!" });
        // Clear password fields after successful edit
        setPassword('');
        setConfirmPassword('');
    };

    const handleDeleteDriver = (driverId: string) => {
        // In a real app, call backend to delete
        // Add checks here if needed (e.g., cannot delete if driver has active trips)

        const index = initialDrivers.findIndex(d => d.id === driverId);
        if (index !== -1) {
            initialDrivers.splice(index, 1); // Remove from global mock data
        }
        setDrivers(prevDrivers => prevDrivers.filter(d => d.id !== driverId)); // Update local state
        toast({ title: "Motorista excluído." });
    };

    const openEditModal = (driver: Driver) => {
        setCurrentDriver(driver);
        setName(driver.name);
        setUsername(driver.username);
        setEmail(driver.email);
        setBase(driver.base);
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
                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nome do motorista" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="username">Nome de Usuário*</Label>
                                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Ex: joao.silva" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail*</Label>
                                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="motorista@email.com" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="base">Base*</Label>
                                <Input id="base" value={base} onChange={(e) => setBase(e.target.value)} required placeholder="Base de operação (Ex: SP, RJ)" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Senha*</Label>
                                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirmar Senha*</Label>
                                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Repita a senha" />
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline" onClick={closeCreateModal}>Cancelar</Button>
                                </DialogClose>
                                <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Motorista</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {drivers.length === 0 ? (
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
                                         <Building className="h-3 w-3" /> Base: {driver.base}
                                     </CardDescription>
                                </div>
                                <div className="flex gap-1">
                                    {/* Edit Button */}
                                    <Dialog open={isEditModalOpen && currentDriver?.id === driver.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" onClick={() => openEditModal(driver)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
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
                                                    <Input id="editName" value={name} onChange={(e) => setName(e.target.value)} required />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editUsername">Nome de Usuário*</Label>
                                                    <Input id="editUsername" value={username} onChange={(e) => setUsername(e.target.value)} required />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editEmail">E-mail*</Label>
                                                    <Input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                                </div>
                                                 <div className="space-y-2">
                                                    <Label htmlFor="editBase">Base*</Label>
                                                    <Input id="editBase" value={base} onChange={(e) => setBase(e.target.value)} required />
                                                 </div>
                                                <div className="space-y-2 mt-4 border-t pt-4">
                                                    <Label htmlFor="editPassword">Nova Senha (Opcional)</Label>
                                                    <Input id="editPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Deixe em branco para manter a atual" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="editConfirmPassword">Confirmar Nova Senha</Label>
                                                    <Input id="editConfirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" disabled={!password} />
                                                </div>
                                                <DialogFooter>
                                                    <DialogClose asChild>
                                                        <Button type="button" variant="outline" onClick={closeEditModal}>Cancelar</Button>
                                                    </DialogClose>
                                                    <Button type="submit" className="bg-primary hover:bg-primary/90">Salvar Alterações</Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>

                                    {/* Delete Button */}
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Excluir Motorista</span>
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Tem certeza que deseja excluir o motorista {driver.name} ({driver.username})? Esta ação não pode ser desfeita.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteDriver(driver.id)}
                                                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                                >
                                                    Excluir
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
