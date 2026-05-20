import { login } from './actions'
import styles from './login.module.css'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const resolvedParams = await searchParams
  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <h1>NCM Digital</h1>
          <p>Gestión de Mensajes</p>
        </div>

        <form className={styles.form} action={login}>
          {resolvedParams?.error && (
            <div className={styles.error}>{resolvedParams.error}</div>
          )}
          
          <div className={styles.inputGroup}>
            <label htmlFor="email">Correo Electrónico</label>
            <input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="tu@correo.com" 
              required 
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Contraseña</label>
            <input 
              id="password" 
              name="password" 
              type="password" 
              placeholder="••••••••" 
              required 
            />
          </div>

          <button className={styles.submitBtn} type="submit">
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  )
}
