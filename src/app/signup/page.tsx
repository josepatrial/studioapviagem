// src/app/signup/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, ArrowLeft, Building } from 'lucide-react'; // Added Building Icon

export default function SignupPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [base, setBase] = useState(''); // Added base state
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth(); // Use signup function from context
  const router = useRouter();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Erro', description: 'As senhas não coincidem.' });
      return;
    }
    if (password.length < 6) {
       toast({ variant: 'destructive', title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.' });
       return;
    }
    if (!name.trim()) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Nome Completo é obrigatório.' });
        return;
    }
    if (!base.trim()) { // Added validation for base
        toast({ variant: 'destructive', title: 'Erro', description: 'Base Operacional é obrigatória.' });
        return;
    }
    // Add username validation if needed

    setIsLoading(true);
    // Pass base to the signup function
    const success = await signup(email, password, name, username, base);
    setIsLoading(false);

    if (success) {
      toast({
        title: 'Cadastro realizado com sucesso!',
        description: 'Você será redirecionado para a tela de login.',
      });
      router.push('/login'); // Redirect to login page after successful signup
    }
    // Error toast is handled within the signup function in AuthContext
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Criar Conta</CardTitle>
          <CardDescription>Preencha os dados para se cadastrar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo*</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
               <Label htmlFor="username">Nome de Usuário (opcional)</Label>
               <Input
                 id="username"
                 type="text"
                 placeholder="Seu nome de usuário (ex: joao.silva)"
                 value={username}
                 onChange={(e) => setUsername(e.target.value)}
                 disabled={isLoading}
                 // Username is optional for now
               />
             </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail*</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
                <Label htmlFor="base">Base Operacional*</Label>
                <Input
                    id="base"
                    type="text"
                    placeholder="Ex: SP, RJ, MG"
                    value={base}
                    onChange={(e) => setBase(e.target.value.toUpperCase())} // Optional: Convert to uppercase
                    required
                    disabled={isLoading}
                />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha*</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha*</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {isLoading ? 'Cadastrando...' : 'Cadastrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2 pt-4">
          <p className="text-sm text-muted-foreground">Já tem uma conta?</p>
          <Link href="/login" passHref>
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Login
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
