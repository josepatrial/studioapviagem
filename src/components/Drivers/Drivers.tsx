// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building, Loader2, UploadCloud, FileUp, RefreshCw } from 'lucide-react'; // Added RefreshCw
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
// Removed Firebase Auth import as it's not directly used for listing all users client-side
import { getDrivers as fetchOnlineDrivers, addUser as addUserOnline, updateUser as updateUserOnline, deleteUser as deleteUserOnline } from '@/services/firestoreService';
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

type Driver = AppUser & { username?: string };

export const Drivers: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loadingDrivers, setLoadingDrivers] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
    const [isSyncingOnline, setIsSyncingOnline] = useState(false); // New state for online sync

    const fetchLocalDriversData = async () => {
        setLoadingDrivers(true);
        try {
            const localDriversData: DbUser[] = await getLocalRecordsByRole('driver');
            console.log(`[Drivers] Found ${localDriversData.length} drivers locally.`);
            setDrivers(localDriversData.map(({ passwordHash, ...driverData }) => driverData as Driver).sort((a,b)=> (a.name || '').localeCompare(b.name || '')));
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
    }, [toast]);


    const handleSyncOnlineDrivers = async () => {
        if (!navigator.onLine) {
            toast({ variant: "destructive", title: "Offline", description: "Você precisa estar online para sincronizar os motoristas." });
            return;
        }
        setIsSyncingOnline(true);
        toast({ title: "Sincronizando...", description: "Buscando motoristas online." });
        try {
            // This fetches from the 'users' collection in Firestore where role is 'driver'
            const onlineDriversData = await fetchOnlineDrivers();
            console.log(`[Drivers Sync] Found ${onlineDriversData.length} drivers online from Firestore 'users' collection.`);

            let newDriversAddedCount = 0;
            let updatedDriversCount = 0;

            if (onlineDriversData.length > 0) {
                const savePromises = onlineDriversData.map(async (onlineDriver) => {
                    // onlineDriver.id is the Firebase UID
                    const existingLocalDriver = await getLocalUser(onlineDriver.id).catch(() => null);
                    const localUserData: DbUser = {
                        id: onlineDriver.id, // This is the Firebase Auth UID
                        email: onlineDriver.email,
                        name: onlineDriver.name || onlineDriver.email || `Motorista ${onlineDriver.id.substring(0,6)}`,
                        username: onlineDriver.username,
                        role: 'driver', // Ensure role is driver
                        base: onlineDriver.base || 'N/A',
                        passwordHash: existingLocalDriver?.passwordHash || '', // Preserve existing hash or set empty; passwords are not synced from Auth
                        lastLogin: existingLocalDriver?.lastLogin || new Date().toISOString(),
                    };

                    try {
                        await saveLocalUser(localUserData);
                        if (!existingLocalDriver) {
                            newDriversAddedCount++;
                        } else {
                             // Basic check for actual changes, excluding passwordHash and lastLogin which are managed locally
                             const hasChanged = existingLocalDriver.name !== localUserData.name ||
                                               existingLocalDriver.email !== localUserData.email ||
                                               existingLocalDriver.username !== localUserData.username ||
                                               existingLocalDriver.base !== localUserData.base ||
                                               existingLocalDriver.role !== localUserData.role;
                            if (hasChanged) {
                               updatedDriversCount++;
                            }
                        }
                    } catch (saveError) {
                        console.error(`[Drivers Sync] Error saving/updating driver ${onlineDriver.id} locally:`, saveError);
                    }
                });
                await Promise.all(savePromises);
            }
            await fetchLocalDriversData(); // Refresh local driver list
            toast({
                title: "Sincronização Concluída!",
                description: `${newDriversAddedCount} novo(s) motorista(s) adicionado(s). ${updatedDriversCount} motorista(s) atualizado(s). Total online (Firestore 'users'): ${onlineDriversData.length}.`,
                duration: 7000,
            });

        } catch (onlineError: any) {
            console.error("[Drivers Sync] Error fetching online drivers from Firestore 'users':", onlineError);
            toast({ variant: "destructive", title: "Erro na Sincronização Online", description: `Não foi possível buscar motoristas online: ${onlineError.message}` });
        } finally {
            setIsSyncingOnline(false);
        }
    };


    // Core logic for creating a new driver locally
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

            const newDriverUI: Driver = { id: userId, ...userDataForDb };
            setDrivers(prevDrivers => [newDriverUI, ...prevDrivers].sort((a,b)=> (a.name || '').localeCompare(b.name || '')));
            return true;
        } catch (error: any) {
            console.error("[Drivers] Error in _createNewDriver:", error);
            toast({ variant: "destructive", title: "Erro no Cadastro", description: `Ocorreu um erro ao cadastrar o motorista: ${error.message}` });
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddDriver = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !password || !confirmPassword || !base) {
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

        const success = await _createNewDriver(name, username || undefined, email, base, password);
        if (success) {
            resetForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado localmente!", description: "Conta criada com sucesso. Sincronize para enviar online." });
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
                syncStatus: originalLocalUser.syncStatus === 'synced' ? 'pending' : originalLocalUser.syncStatus, // Mark for sync
            };

            await saveLocalUser(updatedLocalData);

            const updatedDriverUI = { ...updatedLocalData } as Driver;
            delete (updatedDriverUI as any).passwordHash;

            setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? updatedDriverUI : d).sort((a,b)=> (a.name || '').localeCompare(b.name || '')));

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
        const fieldsToExport: (keyof Driver)[] = ['name', 'username', 'email', 'base'];
        const headerRow = fieldsToExport.join(',');
        const dataToExport = drivers.map(driver => {
            return fieldsToExport.map(field => {
                let cellValue = driver[field] === null || driver[field] === undefined ? '' : String(driver[field]);
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
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIndex = header.indexOf('nome');
        const usernameIndex = header.indexOf('nome de usuário');
        const emailIndex = header.indexOf('e-mail');
        const baseIndex = header.indexOf('base');
        const tempPasswordIndex = header.indexOf('senhatemporaria');
        if (nameIndex === -1 || emailIndex === -1 || baseIndex === -1) {
            toast({ variant: 'destructive', title: 'Cabeçalho CSV inválido', description: `Esperado: nome, e-mail, base (opcional: nome de usuário, senhatemporaria). Verifique o arquivo de exemplo.` });
            return;
        }
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];
        setIsSaving(true);
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const driverName = values[nameIndex];
            const driverUsername = usernameIndex !== -1 ? values[usernameIndex] : undefined;
            const driverEmail = values[emailIndex];
            const driverBase = values[baseIndex];
            const driverPassword = tempPasswordIndex !== -1 && values[tempPasswordIndex] ? values[tempPasswordIndex] : "password@123";
            if (!driverName || !driverEmail || !driverBase) {
                errors.push(`Linha ${i + 1}: Campos obrigatórios (Nome, E-mail, Base) faltando.`);
                errorCount++;
                continue;
            }
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
            }
        }
        setIsSaving(false);
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
        if (successCount === 0 && errorCount === 0 && lines.length > 1) {
            toast({ variant: 'default', title: 'Importação', description: 'Nenhum motorista novo para importar ou todos já existem.' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h2 className="text-2xl font-semibold">Gerenciar Motoristas</h2>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSyncOnlineDrivers} variant="outline" className="text-primary-foreground bg-blue-600 hover:bg-blue-700" disabled={isSyncingOnline || isSaving}>
                        {isSyncingOnline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        {isSyncingOnline ? 'Sincronizando...' : 'Sincronizar Online'}
                    </Button>
                    {/* Removed Export, Import, and Cadastrar Motorista buttons */}
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
                        {/* Button to trigger modal removed */}
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
                                            <Button variant="ghost" size="icon" onClick={() => openEditModal(driver)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving || isSyncingOnline}>
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
                                {/* Removed section showing passwordHash and lastLogin from UI */}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
