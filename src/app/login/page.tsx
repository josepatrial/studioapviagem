// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LogIn, UserPlus } from 'lucide-react';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, loading: authLoading } = useAuth(); // Get login function and loading state
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Call the login function from AuthContext
    const success = await login(email, password);
    setIsLoading(false); // Set loading false after login attempt completes

    if (success) {
      toast({
        title: "Login bem-sucedido!",
        description: "Redirecionando para o painel...",
      });
      router.push('/'); // Redirect to dashboard on successful login
    }
    // Error toast is handled within the login function in AuthContext
  };

   // Use authLoading from context to disable fields during initial auth checks
   const isProcessing = isLoading || authLoading;

  return (
    // Adjusted padding for larger screens and ensured full height with flex centering
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 p-4 md:px-8 lg:px-12">
      {/* Adjusted Card styling for better visual appeal */}
      <Card className="w-full max-w-sm rounded-lg shadow-2xl border-none">
        <CardHeader className="text-center">
          {/* Optional: Add a logo or image here */}
           {/* <Image src="/logo.png" alt="Logo Grupo 2 Irmãos" width={80} height={80} className="mx-auto mb-4" /> */}
          <CardTitle className="text-2xl font-bold text-primary">Grupo 2 Irmãos</CardTitle>
          {/* Updated description text and color */}
          <CardDescription>Bem-vindo! Faça login para continuar.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4"> {/* Added responsive horizontal and vertical padding */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                // Refined input styling
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isProcessing} // Use combined loading state
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                // Refined input styling
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isProcessing} // Use combined loading state
              />
            </div>            
            {/* Adjusted button styling and added conditional text/spinner - Ensure primary color is defined in globals.css */}
             <Button type="submit" className="w-full mt-6 bg-primary hover:bg-primary/90 text-white font-semibold py-2 px-4 rounded-md transition duration-300 ease-in-out" disabled={isProcessing}>
              {isLoading ? 'Entrando...' : authLoading ? 'Verificando...' : <> <LogIn className="mr-2 h-4 w-4" /> Entrar </>}
            </Button>
          </form>
        </CardContent>
        {/* CardFooter with signup option is removed */}
      </Card>
    </div>
  );
}
