// src/components/Drivers/Drivers.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, User, Mail, Hash, Lock, Building, Loader2, UploadCloud, FileUp, RefreshCw, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { setUserData as setFirestoreUserData, getDrivers as fetchFirestoreDrivers } from '@/services/firestoreService';
import {
    getLocalUser,
    saveLocalUser,
    deleteLocalUser as deleteLocalDbUser,
    LocalUser as DbUser,
    getLocalUserByEmail,
    getLocalRecordsByRole,
    getLocalUserByUsername,
} from '@/services/localDbService';
import type { DriverInfo, User as AppUser } from '@/contexts/AuthContext';
import { LoadingSpinner } from '../LoadingSpinner';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from 'date-fns';

type Driver = AppUser & { username?: string; lastLogin?: string; firebaseId?: string; }; // Added firebaseId for clarity

// Helper function to parse CSV data
const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines[0].trim();
    const header = headerLine.split(',').map(h => h.trim().toLowerCase());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',');
        const entry: Record<string, string> = {};
        let nameFound = false;

        for (let j = 0; j < header.length; j++) {
            const normalizedHeader = header[j].replace(/\s+/g, '').toLowerCase(); // Normalize: remove spaces, lowercase
            entry[normalizedHeader] = values[j]?.trim() || '';
            if (normalizedHeader === 'nome' && entry[normalizedHeader]) {
                nameFound = true;
            }
        }
        // Only add if 'nome' is present
        if (nameFound) {
            data.push(entry);
        } else {
            console.warn(`[CSV Parse] Skipping line ${i + 1} due to missing 'Nome'. Line: "${line}"`);
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

    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [createConfirmPassword, setCreateConfirmPassword] = useState('');
    const [createBase, setCreateBase] = useState('');

    const [editName, setEditName] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editBase, setEditBase] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);


    const fetchLocalDriversData = useCallback(async () => {
        setLoadingDrivers(true);
        console.log("[Drivers - fetchLocalDriversData] Fetching local drivers...");
        try {
            const localDriversDataRaw: DbUser[] = await getLocalRecordsByRole('driver');
            console.log(`[Drivers - fetchLocalDriversData] Found ${localDriversDataRaw.length} raw drivers locally.`);
            
            const mappedDrivers = localDriversDataRaw
                .filter(driver => driver.role === 'driver' && !driver.deleted) 
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
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível carregar motoristas locais: ${localError.message}` });
        } finally {
            setLoadingDrivers(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchLocalDriversData();
    }, [fetchLocalDriversData]);


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
                id: newDriverLocalId, // This is the localId
                name: createName,
                email: createEmail,
                username: usernameFromEmail,
                passwordHash,
                role: 'driver',
                base: createBase.toUpperCase(),
                lastLogin: new Date().toISOString(),
                syncStatus: 'pending', // New users created by admin are pending sync
                deleted: false,
                // firebaseId will be set when the user logs in online for the first time
            };

            await saveLocalUser(newDriverData);
            console.log(`[Drivers Add] Saved new driver locally with ID: ${newDriverLocalId}`);

            const { passwordHash: _, ...driverForUI } = newDriverData;
            setDrivers(prev => [...prev, driverForUI as Driver].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
            
            resetCreateForm();
            setIsCreateModalOpen(false);
            toast({ title: "Motorista cadastrado localmente!", description: "O motorista precisa fazer login online para ativar a conta no Firebase." });

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
            const idToFetch = currentDriver.firebaseId || currentDriver.id;
            originalLocalUser = await getLocalUser(idToFetch);
            if (!originalLocalUser) {
                 throw new Error("Motorista original não encontrado localmente para edição.");
            }
        } catch (getError) {
            console.error("[Drivers] Error fetching original local user for edit:", getError);
            toast({ variant: "destructive", title: "Erro Interno", description: "Não foi possível encontrar os dados locais originais do motorista." });
            return;
        }


        let emailExists = false;
        let usernameExists = false;
        try {
            const existingByEmail = await getLocalUserByEmail(editEmail);
            if (existingByEmail && existingByEmail.id !== originalLocalUser.id) emailExists = true;
            
            if (editUsername && editUsername !== originalLocalUser.username) {
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
            const updatedLocalData: DbUser = {
                ...originalLocalUser,
                name: editName,
                username: editUsername || undefined, 
                email: editEmail, 
                base: editBase.toUpperCase(),
                role: 'driver', 
                lastLogin: new Date().toISOString(), 
                syncStatus: 'pending', 
            };

            await saveLocalUser(updatedLocalData);
            console.log(`[Drivers Edit] Saved updated driver locally: ${updatedLocalData.id}, Firebase ID: ${updatedLocalData.firebaseId}`);

            const {passwordHash, ...updatedDriverUI} = updatedLocalData
            const displayId = updatedLocalData.firebaseId || updatedLocalData.id;
            setDrivers(prevDrivers => prevDrivers.map(d => (d.firebaseId || d.id) === displayId ? {...updatedDriverUI, id: displayId} as Driver : d).sort((a, b) => (a.name || '').localeCompare(b.name || '')));

            resetEditForm();
            setIsEditModalOpen(false);
            setCurrentDriver(null);
            toast({ title: "Dados do motorista atualizados localmente!", description: "Sincronize para enviar as alterações." });

        } catch (error: any) {
            console.error("[Drivers] Error updating local driver:", error);
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível atualizar os dados locais: ${error.message}` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteDriver = async (driverIdToDelete: string) => {
        setIsSaving(true);
        try {
            const localUserToDelete = await getLocalUser(driverIdToDelete);
            if (!localUserToDelete) {
                toast({ variant: "destructive", title: "Erro", description: "Motorista não encontrado localmente para exclusão." });
                setIsSaving(false);
                return;
            }

            await deleteLocalDbUser(localUserToDelete.id); 
            console.log(`[Drivers] Driver ${localUserToDelete.id} (Firebase ID: ${localUserToDelete.firebaseId}) marked for deletion locally.`);
            
            setDrivers(prevDrivers => prevDrivers.filter(d => (d.firebaseId || d.id) !== driverIdToDelete));
            if (currentDriver && (currentDriver.firebaseId || currentDriver.id) === driverIdToDelete) {
                closeEditModal(); 
            }
            toast({ title: "Motorista marcado para exclusão.", description: "A exclusão online ocorrerá na próxima sincronização (se já existia online)." });

        } catch (error: any) {
            console.error("[Drivers] Error during driver deletion process:", error);
            toast({ variant: "destructive", title: "Erro Local", description: `Não foi possível processar a exclusão do motorista: ${error.message}` });
        } finally {
            setIsSaving(false);
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

            const DEFAULT_PASSWORD = "DefaultPassword@123";
            let usedDefaultPassword = false;

            try {
                const parsedData = parseCSV(text);
                if (parsedData.length === 0) {
                    toast({ variant: "destructive", title: "Arquivo Vazio ou Inválido", description: "O CSV não contém dados ou está mal formatado." });
                    setIsSaving(false);
                    return;
                }

                let importedCount = 0;
                let skippedCount = 0;
                const skippedReasons: string[] = [];

                for (const row of parsedData) {
                    const name = row['nome']?.trim();

                    if (!name) {
                        const reason = `Linha ignorada: 'Nome' ausente. Dados da linha: ${JSON.stringify(row)}`;
                        console.warn("[CSV Import]", reason);
                        skippedReasons.push(reason);
                        skippedCount++;
                        continue;
                    }

                    const email = row['email']?.trim() || `${name.toLowerCase().replace(/\s+/g, '.')}.${uuidv4().substring(0, 4)}@imported.local`;
                    let password = row['senha']?.trim();
                    if (!password || password.length < 6) {
                        if (password && password.length < 6) {
                            console.warn(`[CSV Import] Senha para ${name} no CSV é muito curta. Usando senha padrão.`);
                        }
                        password = DEFAULT_PASSWORD;
                        usedDefaultPassword = true;
                    }
                    
                    const base = row['base']?.trim().toUpperCase() || 'CSV_IMPORTED';
                    const username = row['username']?.trim() || email.split('@')[0];

                    const existingByEmail = await getLocalUserByEmail(email);
                    if (existingByEmail) {
                        const reason = `Email '${email}' (Nome: ${name}) já existe localmente.`;
                        console.warn("[CSV Import]", reason);
                        skippedReasons.push(reason);
                        skippedCount++;
                        continue;
                    }
                    const existingByUsername = await getLocalUserByUsername(username);
                    if (existingByUsername) {
                        const reason = `Nome de usuário '${username}' (Nome: ${name}) já existe localmente.`;
                        console.warn("[CSV Import]", reason);
                        skippedReasons.push(reason);
                        skippedCount++;
                        continue;
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
                        base,
                        lastLogin: new Date().toISOString(),
                        syncStatus: 'pending', 
                        deleted: false,
                    };

                    try {
                        await saveLocalUser(newDriverData);
                        importedCount++;
                    } catch (saveError: any) {
                        const reason = `Erro ao salvar ${name} (Email: ${email}): ${saveError.message}`;
                        console.error(`[CSV Import] Error saving imported driver ${name} (Email: ${email}):`, saveError);
                        toast({ variant: "destructive", title: "Erro ao Salvar Motorista Importado", description: reason});
                        skippedReasons.push(reason);
                        skippedCount++;
                    }
                }

                await fetchLocalDriversData(); 
                let importToastDescription = `${importedCount} motoristas importados. ${skippedCount} ignorados.`;
                if (usedDefaultPassword) {
                    importToastDescription += ` Senha padrão "${DEFAULT_PASSWORD}" usada para alguns. Altere-as imediatamente.`;
                }
                if (skippedReasons.length > 0) {
                    importToastDescription += ` Motivos para ignorados (ver console): ${skippedReasons.slice(0,2).join(', ')}${skippedReasons.length > 2 ? '...' : ''}`;
                    console.warn("[CSV Import] Detalhes dos motoristas ignorados:", skippedReasons.join("\n"));
                }
                toast({
                    title: "Importação Concluída",
                    description: importToastDescription,
                    duration: (usedDefaultPassword || skippedReasons.length > 0) ? 10000 : 5000
                });

            } catch (parseError: any) {
                console.error("[CSV Import] Error parsing CSV:", parseError);
                toast({ variant: "destructive", title: "Erro ao Processar CSV", description: parseError.message });
            } finally {
                setIsSaving(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };
        reader.onerror = () => {
            toast({ variant: "destructive", title: "Erro de Leitura", description: "Não foi possível ler o arquivo selecionado." });
            setIsSaving(false);
        };
        reader.readAsText(file);
    };

     const handleSyncOnlineDrivers = useCallback(async () => {
        console.log("[Drivers Sync] Initiating online driver sync...");
        setIsSaving(true);
        toast({ title: "Sincronizando Online...", description: "Buscando e atualizando motoristas do servidor." });
        try {
            const onlineDriversData: DriverInfo[] = await fetchFirestoreDrivers();
            console.log(`[Drivers Sync] Fetched ${onlineDriversData.length} drivers from Firestore.`);
            let newDriversAdded = 0;
            let existingDriversUpdated = 0;

            for (const onlineDriver of onlineDriversData) {
                if (!onlineDriver.id) {
                    console.warn("[Drivers Sync] Skipping online driver due to missing ID:", onlineDriver);
                    continue;
                }
                const existingLocalDriver = await getLocalUser(onlineDriver.id);
                const driverDataForSave: DbUser = {
                    id: onlineDriver.id, // Firebase UID is the primary ID
                    firebaseId: onlineDriver.id,
                    name: onlineDriver.name || onlineDriver.email || `Motorista ${onlineDriver.id.substring(0,6)}`,
                    email: onlineDriver.email,
                    username: onlineDriver.username || onlineDriver.email.split('@')[0] || `user_${onlineDriver.id.substring(0,6)}`,
                    role: 'driver', // Explicitly set role
                    base: onlineDriver.base || 'N/A',
                    lastLogin: existingLocalDriver?.lastLogin || new Date().toISOString(),
                    passwordHash: existingLocalDriver?.passwordHash || '', // Preserve local password hash if exists
                    syncStatus: 'synced',
                    deleted: false,
                };

                try {
                    await saveLocalUser(driverDataForSave);
                    if (existingLocalDriver) {
                        existingDriversUpdated++;
                    } else {
                        newDriversAdded++;
                    }
                } catch (saveError: any) {
                    console.error(`[Drivers Sync] Error saving/updating driver ${onlineDriver.id} locally:`, saveError);
                    toast({ variant: "destructive", title: "Erro ao Salvar Local", description: `Motorista: ${onlineDriver.name}. Erro: ${saveError.message}` });
                }
            }
            console.log(`[Drivers Sync] Sync complete. New: ${newDriversAdded}, Updated: ${existingDriversUpdated}`);
            toast({ title: "Sincronização Concluída!", description: `${newDriversAdded} novos motoristas adicionados, ${existingDriversUpdated} atualizados.` });
            await fetchLocalDriversData(); // Refresh the list from local DB
        } catch (error: any) {
            console.error("[Drivers Sync] Error during online sync:", error);
            toast({ variant: "destructive", title: "Erro na Sincronização Online", description: error.message });
        } finally {
            setIsSaving(false);
        }
    }, [toast, fetchLocalDriversData]);


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
                 <Button onClick={handleSyncOnlineDrivers} variant="outline" disabled={isSaving || loadingDrivers}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Sincronizar Online
                </Button>
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
                            Clique em "Sincronizar Online" para buscar motoristas do servidor. Se o problema persistir, verifique se há motoristas com a função 'driver' no Firestore.
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
                                    <TableRow key={driver.firebaseId || driver.id}>
                                        <TableCell className="font-medium">{driver.name || 'N/A'}</TableCell>
                                        <TableCell>{driver.email}</TableCell>
                                        <TableCell>{driver.base || 'N/A'}</TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            {driver.lastLogin ? format(new Date(driver.lastLogin), 'dd/MM/yyyy HH:mm') : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Dialog open={isViewModalOpen && currentDriver?.id === driver.id && currentDriver?.firebaseId === driver.firebaseId} onOpenChange={(isOpen) => !isOpen && closeViewModal()}>
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
                                                            <p><strong>ID Local/Firebase:</strong> {currentDriver?.firebaseId || currentDriver?.id}</p>
                                                            <p><strong>Nome:</strong> {currentDriver?.name || 'N/A'}</p>
                                                            <p><strong>Nome de Usuário:</strong> {currentDriver?.username || 'N/A'}</p>
                                                            <p><strong>E-mail:</strong> {currentDriver?.email}</p>
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

                                                <Dialog open={isEditModalOpen && currentDriver?.id === driver.id && currentDriver?.firebaseId === driver.firebaseId} onOpenChange={(isOpen) => !isOpen && closeEditModal()}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={() => openEditModal(driver)} className="text-muted-foreground hover:text-accent-foreground h-8 w-8" disabled={isSaving}>
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
                                                                    disabled={isSaving || !!driver.firebaseId} 
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
                                                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" disabled={isSaving}>
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
                                                                onClick={() => handleDeleteDriver(driver.firebaseId || driver.id)}
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

