import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { Alert, Button, Field, TextInput } from '../components/ui.jsx';

export default function LoginPage() {
  const { admin, ready, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (ready && admin) return <Navigate to="/" replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="text-sm text-teal-200">מערכת למנהל הנכס</div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">ניהול נפרד לכל דירה, חודש אחרי חודש.</h1>
          <p className="mt-4 max-w-md text-slate-300">שכר דירה, חשמל, מים, תשלומים חלקיים ואישורי תשלום — במקום אחד, בעברית.</p>
        </div>
        <div className="text-sm text-slate-400">הגישה שמורה למנהל בלבד. לדיירים אין חשבון במערכת.</div>
      </section>
      <section className="flex items-center justify-center p-6">
        <form className="w-full max-w-md space-y-5 rounded-3xl bg-white p-8 shadow-sm" onSubmit={onSubmit}>
          <div>
            <h2 className="text-2xl font-semibold">כניסת מנהל</h2>
            <p className="mt-1 text-sm text-slate-500">הזינו את פרטי המנהל כדי להיכנס למערכת.</p>
          </div>
          <Alert>{error}</Alert>
          <Field label="שם משתמש">
            <TextInput dir="ltr" type="text" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" />
          </Field>
          <Field label="סיסמה">
            <TextInput dir="ltr" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </Field>
          <Button className="w-full" disabled={pending}>{pending ? 'מתחבר...' : 'כניסה'}</Button>
        </form>
      </section>
    </div>
  );
}
