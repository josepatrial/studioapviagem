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
    getLocalUserByUsername, // Import getLocalUserByUsername
} from '@/services/localDbService';
import type { DriverInfo, User as AppUser } from '@/contexts/AuthContext';
import { LoadingSpinner } from '../LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from 'date-fns';

type Driver = AppUser & { username?: string };

// Helper function to parse CSV data
const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return []; // Needs header and at least one data row

    const header = lines[0].split(',').map(h => h.trim().toLowerCase()); // Normalize header
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length === header.length) {
            const entry: Record<string, string> = {};
            for (let j = 0; j < header.length; j++) {
                entry[header[j]] = values[j].trim();
            }
            data.push(entry);
        } else {
            console.warn(`Skipping line ${i + 1} due to mismatched column count.`);
        }
    }
    return data;
};


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
    const [createBase, setCreateBase] = useState('');

    // State for edit form
    const [editName, setEditName] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editBase, setEditBase] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [isSyncingOnline, setIsSyncingOnline] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);


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
            const existingLocalUserByEmail = await getLocalUserByEmail(createEmail);
            if (existingLocalUserByEmail) {
                toast({ variant: "destructive", title: "Erro", description: "Este e-mail já está cadastrado localmente." });
                setIsSaving(false);
                return;
            }
            const usernameFromEmail = createEmail.split('@')[0];
            const existingLocalUserByUsername = await getLocalUserByUsername(usernameFromEmail);
            if (existingLocalUserByUsername) {
                 toast({ variant: "destructive", title: "Erro", description: `O nome de usuário padrão '${usernameFromEmail}' já existe. Forneça um nome de usuário único ou altere o e-mail.` });
                 setIsSaving(false);
                 return;
            }


            const passwordHash = await bcrypt.hash(createPassword, 10);
            const newDriverLocalId = `local_user_${uuidv4()}`;

            const newDriverData: DbUser = {
                id: newDriverLocalId,
                name: createName,
                email: createEmail,
                username: usernameFromEmail,
                passwordHash,
                role: 'driver',
                base: createBase.toUpperCase(),
                lastLogin: new Date().toISOString(),
                syncStatus: 'pending',
            };

            await saveLocalUser(newDriverData);

            const { passwordHash: _, ...driverForUI } = newDriverData;
            setDrivers(prev => [...prev, driverForUI as Driver].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            
            resetCreateForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado localmente!", description: "Sincronize para enviar online, se necessário." });

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
            
            if (editUsername && editUsername !== originalLocalUser.username) { // Only check if username changed
                 const existingByUsername = await getLocalUserByUsername(editUsername);
                 if(existingByUsername && existingByUsername.id !== originalLocalUser.id) usernameExists = true;
            }
        } catch (checkError) {
            console.error("[Drivers] Error checking for existing user locally during edit:", checkError);
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
                role: 'driver', 
            };

            const updatedLocalData: DbUser = {
                ...originalLocalUser,
                ...dataToUpdate,
                lastLogin: new Date().toISOString(), 
                syncStatus: originalLocalUser.syncStatus === 'synced' ? 'pending' : originalLocalUser.syncStatus,
            };

            await saveLocalUser(updatedLocalData);

            const {passwordHash, ...updatedDriverUI} = updatedLocalData
            setDrivers(prevDrivers => prevDrivers.map(d => d.id === currentDriver.id ? (updatedDriverUI as Driver) : d).sort((a, b) => (a.name || '').localeCompare(b.name || '')));

            resetEditForm();
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
            if (localUserToDelete.firebaseId) {
                 await deleteLocalDbUser(driverId); 
                 console.log(`[Drivers] Driver ${driverId} marked for deletion locally.`);
                 toast({ title: "Motorista marcado para exclusão.", description: "A exclusão online ocorrerá na próxima sincronização." });
            } else {
                 await deleteLocalDbUser(driverId, true);
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

    const handleSyncOnlineDrivers = async () => {
        setIsSyncingOnline(true);
        toast({ title: "Sincronizando...", description: "Buscando motoristas online." });
        try {
            const onlineDriversInfo = await fetchOnlineDrivers(); // Fetches DriverInfo[]
            console.log(`[Drivers Sync] Fetched ${onlineDriversInfo.length} drivers from Firestore.`);

            if (onlineDriversInfo.length === 0) {
                toast({ title: "Nenhum motorista online", description: "Nenhum motorista com a função 'driver' encontrado no Firestore." });
                setIsSyncingOnline(false);
                return;
            }

            let newDriversAdded = 0;
            let existingDriversUpdated = 0;

            for (const onlineDriver of onlineDriversInfo) {
                let localDriver = await getLocalUser(onlineDriver.id); // Check by Firebase UID

                if (localDriver) {
                    // Update existing local driver if Firestore data is different
                    const needsUpdate =
                        localDriver.name !== (onlineDriver.name || onlineDriver.email) ||
                        localDriver.email !== onlineDriver.email ||
                        localDriver.base !== (onlineDriver.base || 'N/A') ||
                        localDriver.username !== (onlineDriver.username || onlineDriver.email.split('@')[0]) ||
                        localDriver.role !== 'driver' || // Ensure role is driver
                        localDriver.syncStatus !== 'synced';

                    if (needsUpdate) {
                        const updatedLocal: DbUser = {
                            ...localDriver, // Keep existing localId, passwordHash, lastLogin
                            name: onlineDriver.name || onlineDriver.email || `Motorista ${onlineDriver.id.substring(0,6)}`,
                            email: onlineDriver.email,
                            username: onlineDriver.username || onlineDriver.email.split('@')[0],
                            role: 'driver',
                            base: onlineDriver.base || 'N/A',
                            firebaseId: onlineDriver.id,
                            syncStatus: 'synced',
                        };
                        await saveLocalUser(updatedLocal);
                        existingDriversUpdated++;
                        console.log(`[Drivers Sync] Updated local driver: ${onlineDriver.id}`);
                    }
                } else {
                    // New driver from Firestore, add to local DB
                    // Password hash will be empty; user needs to set/reset password if they log in locally first
                    const newLocalDriver: DbUser = {
                        id: onlineDriver.id, // Use Firebase UID as primary local ID now
                        firebaseId: onlineDriver.id,
                        name: onlineDriver.name || onlineDriver.email || `Motorista ${onlineDriver.id.substring(0,6)}`,
                        email: onlineDriver.email,
                        username: onlineDriver.username || onlineDriver.email.split('@')[0],
                        role: 'driver',
                        base: onlineDriver.base || 'N/A',
                        passwordHash: '', // No password hash from Firestore
                        lastLogin: new Date().toISOString(), // Set current time as lastLogin for new sync
                        syncStatus: 'synced',
                    };
                    await saveLocalUser(newLocalDriver);
                    newDriversAdded++;
                    console.log(`[Drivers Sync] Added new local driver from Firestore: ${onlineDriver.id}`);
                }
            }

            await fetchLocalDriversData(); // Refresh UI list
            toast({ title: "Sincronização Concluída!", description: `${newDriversAdded} motoristas novos adicionados, ${existingDriversUpdated} atualizados.` });

        } catch (error: any) {
            console.error("[Drivers] Error syncing online drivers:", error);
            toast({ variant: "destructive", title: "Erro de Sincronização", description: `Não foi possível buscar motoristas online: ${error.message}` });
        } finally {
            setIsSyncingOnline(false);
        }
    };

    const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsSaving(true);
        toast({ title: "Importando...", description: "Processando arquivo CSV." });

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) {
                toast({ variant: "destructive", title: "Erro ao ler arquivo", description: "Não foi possível ler o conteúdo do arquivo." });
                setIsSaving(false);
                return;
            }

            try {
                const parsedData = parseCSV(text);
                if (parsedData.length === 0) {
                    toast({ variant: "destructive", title: "Arquivo Vazio ou Inválido", description: "O CSV não contém dados ou está mal formatado." });
                    setIsSaving(false);
                    return;
                }

                let importedCount = 0;
                let skippedCount = 0;

                for (const row of parsedData) {
                    const name = row['nome'];
                    const email = row['email'];
                    const password = row['senha']; // Assume 'senha' column for password
                    const base = row['base'];
                    const username = row['username'] || email?.split('@')[0]; // Optional username

                    if (!name || !email || !password || !base ) { // Username is optional
                        console.warn("Skipping row due to missing required fields:", row);
                        skippedCount++;
                        continue;
                    }
                    if (password.length < 6) {
                        console.warn("Skipping row due to short password:", row);
                        skippedCount++;
                        continue;
                    }

                    // Check for existing user by email or username
                    const existingByEmail = await getLocalUserByEmail(email);
                    if (existingByEmail) {
                        console.warn(`Skipping user ${email} (already exists by email).`);
                        skippedCount++;
                        continue;
                    }
                    if (username) {
                        const existingByUsername = await getLocalUserByUsername(username);
                        if (existingByUsername) {
                            console.warn(`Skipping user with username ${username} (already exists).`);
                            skippedCount++;
                            continue;
                        }
                    }


                    const passwordHash = await bcrypt.hash(password, 10);
                    const newDriverLocalId = `local_user_${uuidv4()}`;

                    const newDriverData: DbUser = {
                        id: newDriverLocalId,
                        name,
                        email,
                        username,
                        passwordHash,
                        role: 'driver',
                        base: base.toUpperCase(),
                        lastLogin: new Date().toISOString(),
                        syncStatus: 'pending',
                    };

                    try {
                        await saveLocalUser(newDriverData);
                        importedCount++;
                    } catch (saveError: any) {
                        console.error(`Error saving imported driver ${email}:`, saveError);
                        toast({ variant: "destructive", title: "Erro ao Salvar Motorista", description: `Falha ao salvar ${email}: ${saveError.message}`});
                        skippedCount++;
                    }
                }

                await fetchLocalDriversData(); // Refresh the list
                toast({
                    title: "Importação Concluída",
                    description: `${importedCount} motoristas importados. ${skippedCount} ignorados (duplicados, dados ausentes ou senha curta).`
                });

            } catch (parseError: any) {
                console.error("Error parsing CSV:", parseError);
                toast({ variant: "destructive", title: "Erro ao Processar CSV", description: parseError.message });
            } finally {
                setIsSaving(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = ""; // Reset file input
                }
            }
        };
        reader.onerror = () => {
            toast({ variant: "destructive", title: "Erro de Leitura", description: "Não foi possível ler o arquivo selecionado." });
            setIsSaving(false);
        };
        reader.readAsText(file);
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
                    <Button onClick={handleSyncOnlineDrivers} variant="outline" disabled={isSyncingOnline || isSaving}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingOnline ? 'animate-spin' : ''}`} />
                        {isSyncingOnline ? 'Sincronizando...' : 'Sincronizar Online'}
                    </Button>
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
                    <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileImport} style={{ display: 'none' }} />
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" disabled={isSaving}>
                        <FileUp className="mr-2 h-4 w-4" /> Importar Motoristas (CSV)
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
                            Nenhum motorista cadastrado localmente. Clique em "Sincronizar Online" para buscar motoristas do servidor,
                            "Cadastrar Motorista" para adicionar manualmente, ou "Importar Motoristas (CSV)".
                            Se o problema persistir após sincronizar, verifique se há motoristas com a função 'driver' no Firestore.
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
                                                            <p><strong>ID Local:</strong> {currentDriver?.id}</p>
                                                            <p><strong>ID Firebase:</strong> {currentDriver?.firebaseId || 'Não Sincronizado'}</p>
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
                                                                    disabled={isSaving || !!driver.firebaseId} // Disable if has firebaseId (synced)
                                                                    title={!!driver.firebaseId ? "E-mail não pode ser alterado para contas sincronizadas online." : ""}
                                                                />
                                                                 {!!driver.firebaseId && (
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
                                                                Tem certeza que deseja excluir o motorista {driver.name} ({driver.email})? Motoristas já sincronizados online serão marcados para exclusão na próxima sincronização. Motoristas locais serão removidos permanentemente.
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
