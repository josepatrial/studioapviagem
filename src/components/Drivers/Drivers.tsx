// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building, Loader2, UploadCloud, FileUp, RefreshCw, Eye } from 'lucide-react'; // Added Eye icon
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getDrivers as fetchOnlineDrivers, addUser as addUserOnline, updateUser as updateUserOnline, deleteUser as deleteUserOnline, getUserByEmail } from '@/services/firestoreService';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser as deleteLocalDbUser,
    LocalUser as DbUser,
    getLocalUserByEmail,
    getLocalRecordsByRole,
    addLocalRecord,
    updateLocalRecord,
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [base, setBase] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncingOnline, setIsSyncingOnline] = useState(false);

    const fetchLocalDriversData = async () => {
        setLoadingDrivers(true);
        try {
            const localDriversData: DbUser[] = await getLocalRecordsByRole('driver');
            console.log(`[Drivers] Found ${localDriversData.length} drivers locally. Data:`, JSON.stringify(localDriversData.map(d => ({id: d.id, name: d.name, email: d.email, role: d.role}))));
            const mappedDrivers = localDriversData
                .filter(driver => driver.role === 'driver')
                .map(({ passwordHash, ...driverData }) => driverData as Driver)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setDrivers(mappedDrivers);
            console.log(`[Drivers] Mapped and set ${mappedDrivers.length} drivers to UI state.`);
        } catch (localError: any) {
            console.error("[Drivers] Error fetching local drivers:", localError);
            if (!(localError.message.includes("Failed to fetch") || localError.message.includes("NetworkError"))) {
                toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível carregar motoristas locais: ${localError.message}` });
            }
            setDrivers([]);
        } finally {
            setLoadingDrivers(false);
        }
    };

    useEffect(() => {
        fetchLocalDriversData();
    }, []);


    const handleSyncOnlineDrivers = async () => {
        if (!navigator.onLine) {
            toast({ variant: "destructive", title: "Offline", description: "Você precisa estar online para sincronizar os motoristas." });
            return;
        }
        setIsSyncingOnline(true);
        toast({ title: "Sincronizando...", description: "Buscando motoristas online." });
        try {
            const onlineDriversData = await fetchOnlineDrivers();
            console.log(`[Drivers Sync] Found ${onlineDriversData.length} drivers online from Firestore 'users' collection. Data:`, JSON.stringify(onlineDriversData.map(d => ({id: d.id, name: d.name, email: d.email, role: d.role}))));

            let newDriversAddedCount = 0;
            let updatedDriversCount = 0;
            let skippedExistingCount = 0;

            if (onlineDriversData.length > 0) {
                const savePromises = onlineDriversData.map(async (onlineDriver) => {
                    let existingLocalDriver: DbUser | null = null;
                    try {
                        existingLocalDriver = await getLocalUser(onlineDriver.id);
                        if (!existingLocalDriver && onlineDriver.email) {
                            existingLocalDriver = await getLocalUserByEmail(onlineDriver.email);
                            if (existingLocalDriver && existingLocalDriver.id !== onlineDriver.id) {
                                console.warn(`[Drivers Sync] Local user with email ${onlineDriver.email} has ID ${existingLocalDriver.id}, but Firestore ID is ${onlineDriver.id}. Updating local ID.`);
                            }
                        }
                    } catch (e) {
                        console.log(`[Drivers Sync] No existing local user found for online driver ${onlineDriver.id} or email ${onlineDriver.email}. Will create new.`);
                    }

                    const localUserData: DbUser = {
                        id: onlineDriver.id,
                        email: onlineDriver.email,
                        name: onlineDriver.name || onlineDriver.email || `Motorista ${onlineDriver.id.substring(0, 6)}`,
                        username: onlineDriver.username || '',
                        role: 'driver',
                        base: onlineDriver.base || 'N/A',
                        passwordHash: existingLocalDriver?.passwordHash || '',
                        lastLogin: new Date().toISOString(),
                    };

                    try {
                        await saveLocalUser(localUserData);
                        if (!existingLocalDriver) {
                            newDriversAddedCount++;
                            console.log(`[Drivers Sync] New driver ${localUserData.name} (ID: ${localUserData.id}) saved locally.`);
                        } else {
                            const hasChanged = existingLocalDriver.name !== localUserData.name ||
                                existingLocalDriver.email !== localUserData.email ||
                                existingLocalDriver.username !== localUserData.username ||
                                existingLocalDriver.base !== localUserData.base ||
                                existingLocalDriver.role !== localUserData.role;
                            if (hasChanged) {
                                updatedDriversCount++;
                                console.log(`[Drivers Sync] Driver ${localUserData.name} (ID: ${localUserData.id}) updated locally.`);
                            } else {
                                skippedExistingCount++;
                                console.log(`[Drivers Sync] Driver ${localUserData.name} (ID: ${localUserData.id}) already up-to-date locally.`);
                            }
                        }
                    } catch (saveError) {
                        console.error(`[Drivers Sync] Error saving/updating driver ${onlineDriver.id} locally:`, saveError);
                    }
                });
                await Promise.all(savePromises);
                console.log(`[Drivers Sync] All save promises resolved. New: ${newDriversAddedCount}, Updated: ${updatedDriversCount}, Skipped: ${skippedExistingCount}`);
            } else {
                console.log("[Drivers Sync] No drivers found online in Firestore 'users' collection with role 'driver'.");
            }

            await fetchLocalDriversData();

            toast({
                title: "Sincronização Concluída!",
                description: `${newDriversAddedCount} novo(s) motorista(s) adicionado(s) localmente. ${updatedDriversCount} motorista(s) atualizado(s) localmente. ${skippedExistingCount} já estavam atualizados. Total online (Firestore 'users' com role 'driver'): ${onlineDriversData.length}.`,
                duration: 7000,
            });

        } catch (onlineError: any) {
            console.error("[Drivers Sync] Error fetching online drivers from Firestore 'users':", onlineError);
            toast({ variant: "destructive", title: "Erro na Sincronização Online", description: `Não foi possível buscar motoristas online: ${onlineError.message}` });
        } finally {
            setIsSyncingOnline(false);
        }
    };

    const _createNewDriver = async (
        driverName: string,
        driverUsername: string | undefined,
        driverEmail: string,
        driverBase: string,
        driverPassword: string
    ): Promise<boolean> => {
        setIsSaving(true);
        try {
            const existingByEmail = await getLocalUserByEmail(driverEmail).catch(() => null);
            if (existingByEmail) {
                toast({ variant: "destructive", title: "Erro de Duplicidade", description: `E-mail ${driverEmail} já cadastrado localmente.` });
                setIsSaving(false);
                return false;
            }
            if (driverUsername) {
                const usernameExistsLocally = drivers.some(d => d.username === driverUsername);
                if (usernameExistsLocally) {
                    toast({ variant: "destructive", title: "Erro de Duplicidade", description: `Nome de usuário ${driverUsername} já existe localmente.` });
                    setIsSaving(false);
                    return false;
                }
            }

            const userId = `local_user_${uuidv4()}`;
            const userDataForDb: Omit<DbUser, 'passwordHash' | 'lastLogin' | 'id'> = {
                name: driverName,
                username: driverUsername,
                email: driverEmail,
                base: driverBase.toUpperCase(),
                role: 'driver',
            };

            const localUserData: DbUser = {
                id: userId,
                ...userDataForDb,
                passwordHash: await bcrypt.hash(driverPassword, 10),
                lastLogin: new Date().toISOString(),
            };
            await saveLocalUser(localUserData);
            console.log(`[Drivers] User saved locally with ID: ${userId}`);

            const newDriverUI: Driver = { id: userId, ...userDataForDb, lastLogin: localUserData.lastLogin };
            setDrivers(prevDrivers => [newDriverUI, ...prevDrivers].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            return true;
        } catch (error: any) {
            console.error("[Drivers] Error in _createNewDriver:", error);
            toast({ variant: "destructive", title: "Erro no Cadastro", description: `Ocorreu um erro ao cadastrar o motorista: ${error.message}` });
            return false;
        } finally {
            setIsSaving(false);
        }
    };


    const handleEditDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentDriver) return;
        if (!name || !email || !base) {
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
            if (username) {
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
                username: username || undefined,
                email,
                base: base.toUpperCase(),
                role: 'driver',
            };

            const updatedLocalData: DbUser = {
                ...originalLocalUser,
                ...dataToUpdate,
                lastLogin: new Date().toISOString(),
                syncStatus: originalLocalUser.syncStatus === 'synced' ? 'pending' : originalLocalUser.syncStatus,
            };

            await saveLocalUser(updatedLocalData);

            const updatedDriverUI = { ...updatedLocalData } as Driver;
            delete (updatedDriverUI as any).passwordHash;

            setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? updatedDriverUI : d).sort((a, b) => (a.name || '').localeCompare(b.name || '')));

            resetForm();
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
            await deleteLocalDbUser(driverId);
            console.log(`[Drivers] Driver ${driverId} marked for deletion locally.`);
            setDrivers(prevDrivers => prevDrivers.filter(d => d.id !== driverId));
            toast({ title: "Motorista marcado para exclusão.", description: "A exclusão online ocorrerá na próxima sincronização." });
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
        setPassword('');
        setConfirmPassword('');
        setIsEditModalOpen(true);
    };

    const openViewModal = (driver: Driver) => {
        setCurrentDriver(driver);
        setIsViewModalOpen(true);
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
    const closeViewModal = () => {
        setIsViewModalOpen(false);
        setCurrentDriver(null);
    }


    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h2 className="text-2xl font-semibold">Gerenciar Motoristas</h2>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSyncOnlineDrivers} variant="outline" className="text-primary-foreground bg-blue-600 hover:bg-blue-700" disabled={isSyncingOnline || isSaving}>
                        {isSyncingOnline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        {isSyncingOnline ? 'Sincronizando...' : 'Sincronizar Online'}
                    </Button>
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
                            Clique em "Sincronizar Online" para buscar motoristas do servidor.
                            Se o problema persistir, verifique se há motoristas com a função 'driver' no Firestore.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Motoristas</CardTitle>
                        <CardDescription>Visualização e gerenciamento dos motoristas cadastrados.</CardDescription>
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
                                                                <Input id="editName" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSaving} />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label htmlFor="editUsername">Nome de Usuário (Opcional)</Label>
                                                                <Input id="editUsername" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isSaving} />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label htmlFor="editEmail">E-mail*</Label>
                                                                <Input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                                                    disabled={isSaving || (driver && !driver.id.startsWith('local_'))}
                                                                    title={(driver && !driver.id.startsWith('local_')) ? "Alteração de e-mail indisponível para contas sincronizadas online." : ""}
                                                                />
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
                                                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving || isSyncingOnline}>
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Excluir</span>
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Tem certeza que deseja marcar o motorista {driver.name} ({driver.email}) para exclusão? A exclusão definitiva online ocorrerá na próxima sincronização.
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
