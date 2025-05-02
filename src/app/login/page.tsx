// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // Import Link
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LogIn, UserPlus } from 'lucide-react'; // Added UserPlus icon

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await login(email, password);
    setIsLoading(false);

    if (success) {
      toast({
        title: "Login bem-sucedido!",
        description: "Redirecionando para o painel...",
      });
      router.push('/'); // Redirect to dashboard on successful login
    }
    // Removed the else block that showed the redundant toast.
    // The login function in AuthContext already shows a toast on failure.
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Grupo 2 Irmãos</CardTitle>
          <CardDescription>Bem-vindo! Faça login ou cadastre-se para continuar.</CardDescription> {/* Updated description */}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
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
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
             <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
              {isLoading ? 'Entrando...' : <> <LogIn className="mr-2 h-4 w-4" /> Entrar </>}
            </Button>
             {/* Optional: Add forgot password link */}
             {/* <div className="text-center text-sm">
               <Link href="/forgot-password" className="text-primary hover:underline">
                 Esqueceu sua senha?
               </Link>
             </div> */}
          </form>
        </CardContent>
         <CardFooter className="flex flex-col items-center space-y-2 pt-4">
           <p className="text-sm text-muted-foreground">Não tem uma conta?</p>
           <Link href="/signup" passHref> {/* Link to the signup page */}
              <Button variant="outline" className="w-full">
                 <UserPlus className="mr-2 h-4 w-4" /> Cadastrar
              </Button>
           </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
