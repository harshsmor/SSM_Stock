import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Loader2, User } from 'lucide-react'; // Changed icon to User

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let loginEmail = email;
            if (email.trim().toLowerCase() === 'ssm') {
                loginEmail = 'ssm.admin@gmail.com';
            }

            const { error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (error) throw error;
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-industrial-bg flex items-center justify-center p-4">
            <div className="card w-full max-w-md border-industrial-border/50 bg-industrial-surface/50 backdrop-blur-sm">
                <div className="text-center mb-8">
                    <div className="bg-industrial-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <User className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">SSM Stock</h1>
                    <p className="text-industrial-muted">Authorized Personnel Only</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-industrial-muted mb-2">
                            Username
                        </label>
                        <input
                            type="text"
                            value={email} // keeping variable name 'email' for internal state is fine, or refactor to 'username'
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-field"
                            placeholder="Enter Username"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-industrial-muted mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
