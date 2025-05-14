// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building, Loader2, UploadCloud, FileUp, RefreshCw, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getDrivers as fetchOnlineDrivers, setUserData as setFirestoreUserData } from '@/services/firestoreService';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser as deleteLocalDbUser,
    LocalUser as DbUser,
    getLocalUserByEmail,
    getLocalRecordsByRole,
} from '@/services/localDbService';
import type { DriverInfo, User as AppUser } from '@/contexts/AuthContext';
import { LoadingSpinner } from '../LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from 'date-fns';

type Driver = AppUser & { username?: string };

export const Drivers: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loadingDrivers, setLoadingDrivers] = useState(true);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
    const { toast } = useToast();

    // State for create form
    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createConfirmPassword, setCreateConfirmPassword] = useState('');
    const [createBase, setCreateBase] = useState(''); // Added base for creation

    // State for edit form
    const [editName, setEditName] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editBase, setEditBase] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [isSyncingOnline, setIsSyncingOnline] = useState(false);


    const fetchLocalDriversData = async () => {
        setLoadingDrivers(true);
        console.log("[Drivers - fetchLocalDriversData] Fetching local drivers...");
        try {
            const localDriversDataRaw: DbUser[] = await getLocalRecordsByRole('driver');
            console.log(`[Drivers - fetchLocalDriversData] Found ${localDriversDataRaw.length} raw drivers locally.`);
            
            const mappedDrivers = localDriversDataRaw
                .filter(driver => driver.role === 'driver') 
                .map(driverData => {
                    const { passwordHash, ...driverForUI } = driverData; 
                    return driverForUI as Driver;
                })
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            setDrivers(mappedDrivers);
            console.log(`[Drivers - fetchLocalDriversData] Mapped and set ${mappedDrivers.length} drivers to UI state.`);
        } catch (localError: any) {
            console.error("[Drivers - fetchLocalDriversData] Error fetching local drivers:", localError);
            if (!(localError.message.includes("Failed to fetch") || localError.message.includes("NetworkError"))) {
                // toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível carregar motoristas locais: ${localError.message}` });
                 // Keep existing toast but ensure drivers list is cleared if local fetch fails hard
                 setDrivers([]);
            }
        } finally {
            setLoadingDrivers(false);
        }
    };

    useEffect(() => {
        fetchLocalDriversData();
    }, []);


    const handleAddDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createName || !createEmail || !createPassword || !createConfirmPassword || !createBase) {
            toast({ variant: "destructive", title: "Erro", description: "Nome, E-mail, Senha, Confirmar Senha e Base são obrigatórios." });
            return;
        }
        if (createPassword !== createConfirmPassword) {
            toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
            return;
        }
        if (createPassword.length < 6) {
            toast({ variant: "destructive", title: "Erro", description: "A senha deve ter pelo menos 6 caracteres." });
            return;
        }

        setIsSaving(true);
        try {
            const existingLocalUser = await getLocalUserByEmail(createEmail);
            if (existingLocalUser) {
                toast({ variant: "destructive", title: "Erro", description: "Este e-mail já está cadastrado localmente." });
                setIsSaving(false);
                return;
            }

            const passwordHash = await bcrypt.hash(createPassword, 10);
            const newDriverLocalId = `local_user_${uuidv4()}`;

            const newDriverData: DbUser = {
                id: newDriverLocalId,
                name: createName,
                email: createEmail,
                username: createEmail.split('@')[0], // Simple username generation
                passwordHash,
                role: 'driver',
                base: createBase.toUpperCase(),
                lastLogin: new Date().toISOString(),
                syncStatus: 'pending', // New users are pending sync
            };

            await saveLocalUser(newDriverData);

            const { passwordHash: _, ...driverForUI } = newDriverData;
            setDrivers(prev => [...prev, driverForUI as Driver].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            
            resetCreateForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado localmente!", description: "Sincronize para enviar online." });

        } catch (error: any) {
            console.error("[Drivers] Error adding new local driver:", error);
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível cadastrar o motorista: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDriver) return;
        if (!editName || !editEmail || !editBase) {
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
            const existingByEmail = await getLocalUserByEmail(editEmail);
            if (existingByEmail && existingByEmail.id !== originalLocalUser.id) emailExists = true;
            if (editUsername) { // editUsername is from state
                usernameExists = drivers.some(d => d.username === editUsername && d.id !== originalLocalUser!.id);
            }
        } catch (checkError) {
            console.error("[Drivers] Error checking for existing user locally during edit:", checkError);
            // toast({ variant: "destructive", title: "Erro", description: "Não foi possível verificar usuários existentes localmente." });
             // Allow proceeding if check fails, rely on Firestore for ultimate uniqueness if online
        }

        if (emailExists) {
            toast({ variant: "destructive", title: "Erro", description: "E-mail já pertence a outro motorista localmente." });
            return;
        }
        if (usernameExists && editUsername) {
            toast({ variant: "destructive", title: "Erro", description: "Nome de usuário já pertence a outro motorista localmente." });
            return;
        }

        setIsSaving(true);
        try {
            const dataToUpdate: Partial<Omit<DbUser, 'id' | 'passwordHash' | 'lastLogin'>> = {
                name: editName,
                username: editUsername || undefined,
                email: editEmail,
                base: editBase.toUpperCase(),
                role: 'driver', // Ensure role remains driver
            };

            const updatedLocalData: DbUser = {
                ...originalLocalUser,
                ...dataToUpdate,
                lastLogin: new Date().toISOString(), // Update lastLogin on any edit
                syncStatus: originalLocalUser.syncStatus === 'synced' ? 'pending' : originalLocalUser.syncStatus,
            };

            await saveLocalUser(updatedLocalData);

            const {passwordHash, ...updatedDriverUI} = updatedLocalData
            setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? (updatedDriverUI as Driver) : d).sort((a, b) => (a.name || '').localeCompare(b.name || '')));

            resetEditForm();
            setIsEditModalOpen(false);
            setCurrentDriver(null);
            toast({ title: "Dados do motorista atualizados localmente!", description: "Sincronize para enviar as alterações online." });

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
            // Mark for deletion if it has a firebaseId, otherwise delete directly
            if (localUserToDelete.firebaseId) {
                 await deleteLocalDbUser(driverId); // This now marks for deletion
                 console.log(`[Drivers] Driver ${driverId} marked for deletion locally.`);
                 toast({ title: "Motorista marcado para exclusão.", description: "A exclusão online ocorrerá na próxima sincronização." });
            } else {
                 await deleteLocalDbUser(driverId, true); // Force direct delete for local-only user
                 console.log(`[Drivers] Local-only driver ${driverId} deleted directly.`);
                 toast({ title: "Motorista local excluído." });
            }
            setDrivers(prevDrivers => prevDrivers.filter(d => d.id !== driverId));
            if (currentDriver?.id === driverId) {
                closeEditModal();
            }
        } catch (error: any) {
            console.error("[Drivers] Error during driver deletion process:", error);
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível processar a exclusão do motorista: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    const openEditModal = (driver: Driver) => {
        setCurrentDriver(driver);
        setEditName(driver.name || '');
        setEditUsername(driver.username || '');
        setEditEmail(driver.email || '');
        setEditBase(driver.base || '');
        setIsEditModalOpen(true);
    };

    const openViewModal = (driver: Driver) => {
        setCurrentDriver(driver);
        setIsViewModalOpen(true);
    };

    const resetCreateForm = () => {
        setCreateName('');
        setCreateEmail('');
        setCreatePassword('');
        setCreateConfirmPassword('');
        setCreateBase('');
    };
    
    const resetEditForm = () => {
        setEditName('');
        setEditUsername('');
        setEditEmail('');
        setEditBase('');
    };


    const closeCreateModal = () => {
        resetCreateForm();
        setIsCreateModalOpen(false);
    }
    const closeEditModal = () => {
        resetEditForm();
        setIsEditModalOpen(false);
        setCurrentDriver(null);
    }
    const closeViewModal = () => {
        setIsViewModalOpen(false);
        setCurrentDriver(null);
    }


    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h2 className="text-2xl font-semibold">Gerenciar Motoristas</h2>
                <div className="flex flex-wrap gap-2">
                    <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => { if (!isOpen) closeCreateModal(); else setIsCreateModalOpen(true); }}>
                        <DialogTrigger asChild>
                            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Motorista
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                                <DialogTitle>Cadastrar Novo Motorista</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddDriver} className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="createName">Nome Completo*</Label>
                                    <Input id="createName" value={createName} onChange={(e) => setCreateName(e.target.value)} required disabled={isSaving} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="createEmail">E-mail*</Label>
                                    <Input id="createEmail" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required disabled={isSaving} />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="createBase">Base*</Label>
                                    <Input id="createBase" value={createBase} onChange={(e) => setCreateBase(e.target.value.toUpperCase())} required placeholder="Ex: SP, PR" disabled={isSaving} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="createPassword">Senha*</Label>
                                    <Input id="createPassword" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required disabled={isSaving} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="createConfirmPassword">Confirmar Senha*</Label>
                                    <Input id="createConfirmPassword" type="password" value={createConfirmPassword} onChange={(e) => setCreateConfirmPassword(e.target.value)} required disabled={isSaving} />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isSaving}>Cancelar</Button>
                                    </DialogClose>
                                    <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {isSaving ? 'Salvando...' : 'Salvar Motorista Local'}
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
                    <CardHeader>
                        <CardTitle>Nenhum Motorista Encontrado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">
                            Nenhum motorista cadastrado localmente.
                            Clique em "Cadastrar Motorista" para adicionar um novo.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Motoristas</CardTitle>
                        <CardDescription>Visualização e gerenciamento dos motoristas cadastrados localmente.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>E-mail</TableHead>
                                    <TableHead className="hidden md:table-cell">ID</TableHead>
                                    <TableHead>Base</TableHead>
                                    <TableHead className="hidden sm:table-cell">Último Login</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {drivers.map((driver) => (
                                    <TableRow key={driver.id}>
                                        <TableCell className="font-medium">{driver.name || 'N/A'}</TableCell>
                                        <TableCell>{driver.email}</TableCell>
                                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate max-w-[100px]" title={driver.id}>{driver.id}</TableCell>
                                        <TableCell>{driver.base || 'N/A'}</TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            {driver.lastLogin ? format(new Date(driver.lastLogin), 'dd/MM/yyyy HH:mm') : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Dialog open={isViewModalOpen && currentDriver?.id === driver.id} onOpenChange={(isOpen) => !isOpen && closeViewModal()}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={() => openViewModal(driver)} className="text-muted-foreground hover:text-primary h-8 w-8" disabled={isSaving}>
                                                            <Eye className="h-4 w-4" />
                                                            <span className="sr-only">Visualizar</span>
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>Detalhes do Motorista</DialogTitle>
                                                        </DialogHeader>
                                                        <div className="grid gap-2 py-4 text-sm">
                                                            <p><strong>Nome:</strong> {currentDriver?.name || 'N/A'}</p>
                                                            <p><strong>Nome de Usuário:</strong> {currentDriver?.username || 'N/A'}</p>
                                                            <p><strong>E-mail:</strong> {currentDriver?.email}</p>
                                                            <p><strong>ID:</strong> {currentDriver?.id}</p>
                                                            <p><strong>Base:</strong> {currentDriver?.base || 'N/A'}</p>
                                                            <p><strong>Função:</strong> {currentDriver?.role}</p>
                                                            <p><strong>Último Login:</strong> {currentDriver?.lastLogin ? format(new Date(currentDriver.lastLogin), 'dd/MM/yyyy HH:mm:ss') : 'N/A'}</p>
                                                             <p className="text-xs text-muted-foreground">Senha não é exibida por motivos de segurança.</p>
                                                        </div>
                                                        <DialogFooter>
                                                            <DialogClose asChild>
                                                                <Button type="button" variant="outline" onClick={closeViewModal}>Fechar</Button>
                                                            </DialogClose>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>

                                                <Dialog open={isEditModalOpen && currentDriver?.id === driver.id} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={() => openEditModal(driver)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isSyncingOnline}>
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Editar</span>
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-lg">
                                                        <DialogHeader>
                                                            <DialogTitle>Editar Motorista</DialogTitle>
                                                        </DialogHeader>
                                                        <form onSubmit={handleEditDriver} className="grid gap-4 py-4">
                                                            <div className="space-y-2">
                                                                <Label htmlFor="editName">Nome Completo*</Label>
                                                                <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} required disabled={isSaving} />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label htmlFor="editUsername">Nome de Usuário (Opcional)</Label>
                                                                <Input id="editUsername" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} disabled={isSaving} />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label htmlFor="editEmail">E-mail*</Label>
                                                                <Input id="editEmail" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required
                                                                    disabled={isSaving || !(driver && (driver.id.startsWith('local_user_') || !driver.firebaseId))}
                                                                    title={!(driver && (driver.id.startsWith('local_user_') || !driver.firebaseId)) ? "Alteração de e-mail indisponível para contas sincronizadas online." : ""}
                                                                />
                                                                 {!(driver && (driver.id.startsWith('local_user_') || !driver.firebaseId)) && (
                                                                    <p className="text-xs text-destructive">E-mail não pode ser alterado para contas sincronizadas online.</p>
                                                                 )}
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label htmlFor="editBase">Base*</Label>
                                                                <Input id="editBase" value={editBase} onChange={(e) => setEditBase(e.target.value.toUpperCase())} required disabled={isSaving} />
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
                                                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isSyncingOnline}>
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Excluir</span>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Tem certeza que deseja excluir o motorista {driver.name} ({driver.email})? Esta ação não pode ser desfeita para motoristas que ainda não foram sincronizados online. Motoristas já sincronizados serão marcados para exclusão na próxima sincronização.
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
                                                                {isSaving ? 'Excluindo...' : 'Confirmar Exclusão'}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
