// src/app/profile/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, User, Mail, Lock, Building, ListPlus, Trash2, Tag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    addLocalCustomType,
    getLocalCustomTypes,
    markLocalCustomTypeForDeletion,
    CustomType,
    STORE_VISIT_TYPES,
    STORE_EXPENSE_TYPES
} from '@/services/localDbService';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/components/ui/alert-dialog';

const ProfilePage: React.FC = () => {
  const { user, loading, updateEmail, updatePassword, updateProfileName, updateBase } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [newBase, setNewBase] = useState(user?.base || '');

  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUpdatingBase, setIsUpdatingBase] = useState(false);

  const [activeTab, setActiveTab] = useState('name');

  const [visitTypes, setVisitTypes] = useState<CustomType[]>([]);
  const [newVisitTypeInput, setNewVisitTypeInput] = useState('');
  const [expenseTypes, setExpenseTypes] = useState<CustomType[]>([]);
  const [newExpenseTypeInput, setNewExpenseTypeInput] = useState('');
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<{ type: CustomType; category: 'visit' | 'expense' } | null>(null);


  useEffect(() => {
    if (user?.role === 'admin') {
      setLoadingTypes(true);
      Promise.all([getLocalCustomTypes(STORE_VISIT_TYPES), getLocalCustomTypes(STORE_EXPENSE_TYPES)])
        .then(([fetchedVisitTypes, fetchedExpenseTypes]) => {
          setVisitTypes(fetchedVisitTypes);
          setExpenseTypes(fetchedExpenseTypes);
        })
        .catch(err => {
          console.error("Failed to load custom types:", err);
          toast({ variant: 'destructive', title: 'Erro ao carregar tipos', description: 'Não foi possível buscar os tipos customizados.' });
        })
        .finally(() => setLoadingTypes(false));
    }
  }, [user?.role, toast]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  const isAdmin = user.role === 'admin';

  const handleGoBack = () => {
    router.back();
  };

  const handleUpdateName = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName || newName === user.name) {
          toast({ variant: 'default', title: 'Nenhuma alteração', description: 'O nome não foi alterado.'});
          return;
      }
      setIsUpdatingName(true);
      const success = await updateProfileName(newName);
      if (success) {
          // toast is handled in context
      } else {
          // toast is handled in context
          setNewName(user.name || '');
      }
      setIsUpdatingName(false);
  };

   const handleUpdateEmail = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!newEmail || newEmail === user.email) {
        toast({ variant: 'default', title: 'Nenhuma alteração', description: 'O e-mail não foi alterado.'});
        return;
     }
     if (!currentPasswordForEmail) {
        toast({ variant: 'destructive', title: 'Senha necessária', description: 'Digite sua senha atual para alterar o e-mail.'});
        return;
     }
     setIsUpdatingEmail(true);
     const success = await updateEmail(currentPasswordForEmail, newEmail);
     if (success) {
       setCurrentPasswordForEmail('');
     } else {
       setNewEmail(user.email || '');
     }
     setIsUpdatingEmail(false);
   };

   const handleUpdatePassword = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!currentPassword || !newPassword || !confirmNewPassword) {
       toast({ variant: 'destructive', title: 'Campos obrigatórios', description: 'Preencha todos os campos de senha.'});
       return;
     }
     if (newPassword !== confirmNewPassword) {
       toast({ variant: 'destructive', title: 'Senhas não coincidem', description: 'A nova senha e a confirmação devem ser iguais.'});
       return;
     }
     if (newPassword.length < 6) {
        toast({ variant: 'destructive', title: 'Senha muito curta', description: 'A nova senha deve ter pelo menos 6 caracteres.'});
        return;
     }
     setIsUpdatingPassword(true);
     const success = await updatePassword(currentPassword, newPassword);
     if (success) {
       setCurrentPassword('');
       setNewPassword('');
       setConfirmNewPassword('');
     }
     setIsUpdatingPassword(false);
   };

    const handleUpdateBase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBase || newBase === user.base) {
            toast({ variant: 'default', title: 'Nenhuma alteração', description: 'A base não foi alterada.'});
            return;
        }
        if (isAdmin && user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') { 
            toast({ variant: 'destructive', title: 'Operação não permitida', description: 'A base do super administrador não pode ser alterada.'});
            return;
        }
        setIsUpdatingBase(true);
        const success = await updateBase(newBase);
        if (!success) {
            setNewBase(user.base || '');
        }
        setIsUpdatingBase(false);
    };

    const handleAddType = async (category: 'visit' | 'expense') => {
        const typeName = category === 'visit' ? newVisitTypeInput.trim() : newExpenseTypeInput.trim();
        if (!typeName) {
            toast({ variant: 'destructive', title: 'Nome Inválido', description: 'O nome do tipo não pode ser vazio.' });
            return;
        }
        // isUpdatingBase is used as a generic saving indicator for type operations
        setIsUpdatingBase(true); 
        try {
            const storeName = category === 'visit' ? STORE_VISIT_TYPES : STORE_EXPENSE_TYPES;
            const existingTypes = category === 'visit' ? visitTypes : expenseTypes;
            if (existingTypes.some(t => t.name === typeName && !t.deleted)) {
                throw new Error(`Tipo "${typeName}" já existe.`);
            }

            const newLocalId = await addLocalCustomType(storeName, typeName);
            const newType: CustomType = {
                localId: newLocalId,
                id: newLocalId, // for UI key consistency
                name: typeName,
                syncStatus: 'pending',
                deleted: false,
            };

            if (category === 'visit') {
                setVisitTypes(prev => [...prev, newType].sort((a,b) => a.name.localeCompare(b.name)));
                setNewVisitTypeInput('');
            } else {
                setExpenseTypes(prev => [...prev, newType].sort((a,b) => a.name.localeCompare(b.name)));
                setNewExpenseTypeInput('');
            }
            toast({ title: 'Tipo Adicionado!', description: `"${typeName}" foi adicionado localmente e será sincronizado.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao Adicionar', description: error.message || 'Não foi possível adicionar o tipo.' });
        } finally {
            setIsUpdatingBase(false);
        }
    };

    const openDeleteTypeDialog = (type: CustomType, category: 'visit' | 'expense') => {
        setTypeToDelete({ type, category });
    };

    const confirmDeleteType = async () => {
        if (!typeToDelete) return;
        setIsUpdatingBase(true);
        try {
            const storeName = typeToDelete.category === 'visit' ? STORE_VISIT_TYPES : STORE_EXPENSE_TYPES;
            await markLocalCustomTypeForDeletion(storeName, typeToDelete.type.localId);
            
            if (typeToDelete.category === 'visit') {
                setVisitTypes(prev => prev.filter(t => t.localId !== typeToDelete.type.localId));
            } else {
                setExpenseTypes(prev => prev.filter(t => t.localId !== typeToDelete.type.localId));
            }
            toast({ title: 'Tipo Removido!', description: `"${typeToDelete.type.name}" foi marcado para exclusão e será sincronizado.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao Remover', description: error.message || 'Não foi possível remover o tipo.' });
        } finally {
            setIsUpdatingBase(false);
            setTypeToDelete(null);
        }
    };

  return (
    <div className="flex min-h-screen flex-col items-center bg-secondary p-4 md:p-6">
       <div className="w-full max-w-2xl mb-4">
          <Button variant="outline" onClick={handleGoBack} className="bg-background hover:bg-accent">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
       </div>
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Perfil do Usuário</CardTitle>
          <CardDescription>Visualize e atualize suas informações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
             <Label htmlFor="userId">ID do Usuário</Label>
             <Input id="userId" value={user.id} readOnly className="bg-muted/50 cursor-not-allowed" />
             <Label htmlFor="currentEmailDisplay">E-mail Atual</Label>
             <Input id="currentEmailDisplay" value={user.email} readOnly className="bg-muted/50 cursor-not-allowed" />
             <Label htmlFor="currentNameDisplay">Nome Atual</Label>
             <Input id="currentNameDisplay" value={user.name || 'Não definido'} readOnly className="bg-muted/50 cursor-not-allowed" />
             <Label htmlFor="currentBaseDisplay">Base Atual</Label>
             <Input id="currentBaseDisplay" value={user.base || 'Não definida'} readOnly className="bg-muted/50 cursor-not-allowed" />
             {isAdmin && <p className="text-xs text-blue-500 pt-1">Função: Administrador</p>}
          </div>
          <Separator />

           <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
             <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
               <TabsTrigger value="name"><User className="mr-1 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Alterar </span>Nome</TabsTrigger>
               <TabsTrigger value="email"><Mail className="mr-1 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Alterar </span>E-mail</TabsTrigger>
               <TabsTrigger value="password"><Lock className="mr-1 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Alterar </span>Senha</TabsTrigger>
               <TabsTrigger value="base"><Building className="mr-1 sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Alterar </span>Base</TabsTrigger>
               {isAdmin && (
                <>
                  <TabsTrigger value="visitTypes"><Tag className="mr-1 sm:mr-2 h-4 w-4" />Tipos Visita</TabsTrigger>
                  <TabsTrigger value="expenseTypes"><Tag className="mr-1 sm:mr-2 h-4 w-4" />Tipos Despesa</TabsTrigger>
                </>
               )}
             </TabsList>

             <TabsContent value="name" className="mt-6">
                <form onSubmit={handleUpdateName} className="space-y-4">
                  <h3 className="text-lg font-semibold">Alterar Nome de Exibição</h3>
                  <div className="space-y-2">
                    <Label htmlFor="name">Novo Nome</Label>
                    <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Seu nome de exibição" disabled={isUpdatingName} />
                  </div>
                  <Button type="submit" disabled={isUpdatingName || !newName || newName === user.name} className="bg-primary hover:bg-primary/90">
                     {isUpdatingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isUpdatingName ? 'Atualizando...' : 'Salvar Nome'}
                  </Button>
                </form>
             </TabsContent>
             <TabsContent value="email" className="mt-6">
                <form onSubmit={handleUpdateEmail} className="space-y-4">
                  <h3 className="text-lg font-semibold">Alterar Endereço de E-mail</h3>
                  <div className="space-y-2">
                    <Label htmlFor="email">Novo E-mail</Label>
                    <Input id="email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="seu.novo@email.com" required disabled={isUpdatingEmail || user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br'} title={user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' ? "E-mail do super administrador não pode ser alterado." : ""} />
                     {user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br' && (<p className="text-xs text-destructive">E-mail do super administrador não pode ser alterado.</p>)}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentPasswordForEmail">Senha Atual</Label>
                    <Input id="currentPasswordForEmail" type="password" value={currentPasswordForEmail} onChange={(e) => setCurrentPasswordForEmail(e.target.value)} placeholder="Digite sua senha atual" required disabled={isUpdatingEmail || user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br'} />
                    <p className="text-xs text-muted-foreground">Necessário para confirmar a alteração do e-mail.</p>
                  </div>
                  <Button type="submit" disabled={isUpdatingEmail || !currentPasswordForEmail || !newEmail || newEmail === user.email || user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br'} className="bg-primary hover:bg-primary/90">
                    {isUpdatingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isUpdatingEmail ? 'Atualizando...' : 'Salvar E-mail'}
                  </Button>
                </form>
             </TabsContent>
             <TabsContent value="password" className="mt-6">
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <h3 className="text-lg font-semibold">Alterar Senha</h3>
                  <div className="space-y-2"><Label htmlFor="currentPassword">Senha Atual</Label><Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Sua senha atual" required disabled={isUpdatingPassword} /></div>
                  <div className="space-y-2"><Label htmlFor="newPassword">Nova Senha</Label><Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required disabled={isUpdatingPassword} /></div>
                  <div className="space-y-2"><Label htmlFor="confirmNewPassword">Confirmar Nova Senha</Label><Input id="confirmNewPassword" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Repita a nova senha" required disabled={isUpdatingPassword} /></div>
                  <Button type="submit" disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword} className="bg-primary hover:bg-primary/90">
                     {isUpdatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isUpdatingPassword ? 'Atualizando...' : 'Salvar Senha'}
                  </Button>
                </form>
             </TabsContent>
             <TabsContent value="base" className="mt-6">
                <form onSubmit={handleUpdateBase} className="space-y-4">
                  <h3 className="text-lg font-semibold">Alterar Base Operacional</h3>
                  <div className="space-y-2">
                    <Label htmlFor="base">Nova Base</Label>
                    <Input id="base" value={newBase} onChange={(e) => setNewBase(e.target.value.toUpperCase())} placeholder="Ex: SP, RJ, MG" disabled={isUpdatingBase || (isAdmin && user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br')} title={(isAdmin && user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') ? "Base do super administrador não pode ser alterada." : ""} />
                     {(isAdmin && user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br') && (<p className="text-xs text-destructive">Base do super administrador não pode ser alterada.</p>)}
                  </div>
                  <Button type="submit" disabled={isUpdatingBase || !newBase || newBase === user.base || (isAdmin && user.email.toLowerCase() === 'grupo2irmaos@grupo2irmaos.com.br')} className="bg-primary hover:bg-primary/90">
                     {isUpdatingBase && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {isUpdatingBase ? 'Atualizando...' : 'Salvar Base'}
                  </Button>
                </form>
             </TabsContent>

            {isAdmin && (
              <>
                <TabsContent value="visitTypes" className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">Gerenciar Tipos de Visita</h3>
                  <form onSubmit={(e) => { e.preventDefault(); handleAddType('visit'); }} className="flex gap-2 mb-4">
                    <Input value={newVisitTypeInput} onChange={(e) => setNewVisitTypeInput(e.target.value)} placeholder="Novo tipo de visita" disabled={isUpdatingBase || loadingTypes} />
                    <Button type="submit" disabled={isUpdatingBase || loadingTypes || !newVisitTypeInput.trim()} className="bg-primary hover:bg-primary/90">
                      {isUpdatingBase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />} Adicionar
                    </Button>
                  </form>
                  {loadingTypes ? <LoadingSpinner /> : visitTypes.length > 0 ? (
                    <ul className="space-y-2 rounded-md border p-2">
                      {visitTypes.map(type => (
                        <li key={type.localId} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded-sm">
                          <span>{type.name}</span>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteTypeDialog(type, 'visit')} className="h-7 w-7 text-destructive" disabled={isUpdatingBase}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (<p className="text-sm text-muted-foreground">Nenhum tipo de visita cadastrado.</p>)}
                </TabsContent>

                <TabsContent value="expenseTypes" className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">Gerenciar Tipos de Despesa</h3>
                  <form onSubmit={(e) => { e.preventDefault(); handleAddType('expense'); }} className="flex gap-2 mb-4">
                    <Input value={newExpenseTypeInput} onChange={(e) => setNewExpenseTypeInput(e.target.value)} placeholder="Novo tipo de despesa" disabled={isUpdatingBase || loadingTypes} />
                    <Button type="submit" disabled={isUpdatingBase || loadingTypes || !newExpenseTypeInput.trim()} className="bg-primary hover:bg-primary/90">
                      {isUpdatingBase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />} Adicionar
                    </Button>
                  </form>
                   {loadingTypes ? <LoadingSpinner /> : expenseTypes.length > 0 ? (
                    <ul className="space-y-2 rounded-md border p-2">
                      {expenseTypes.map(type => (
                        <li key={type.localId} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded-sm">
                          <span>{type.name}</span>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteTypeDialog(type, 'expense')} className="h-7 w-7 text-destructive" disabled={isUpdatingBase}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (<p className="text-sm text-muted-foreground">Nenhum tipo de despesa cadastrado.</p>)}
                </TabsContent>
              </>
            )}
           </Tabs>
        </CardContent>
      </Card>

        {typeToDelete && (
            <AlertDialog open={!!typeToDelete} onOpenChange={(isOpen) => { if (!isOpen) setTypeToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja remover o tipo "{typeToDelete.type.name}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setTypeToDelete(null)} disabled={isUpdatingBase}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteType} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isUpdatingBase}>
                            {isUpdatingBase && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}
    </div>
  );
};

export default ProfilePage;

