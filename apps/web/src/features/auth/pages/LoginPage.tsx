import { useId, useState, type CSSProperties, type FormEvent } from 'react';

import {
  FlechaConector,
  IconoEjecutar,
  IconoEscudo,
  IconoMejorar,
  IconoOjo,
  IconoOjoTachado,
  IconoPlanificar,
  IconoVerificar,
  IsotipoUC,
  LogotipoUC,
} from '../components/icons';
import './LoginPage.css';

/**
 * Paleta institucional cerrada. El tipo impide tematizar con un morado que no
 * pertenezca a la identidad de la Universidad Continental.
 */
export type MoradoInstitucional = '#6802C1' | '#7C19E0' | '#8E41D0' | '#57019F';

export interface Credenciales {
  correo: string;
  password: string;
}

export interface LoginPageProps {
  /** Color primario: botón, enlaces, acentos e inicio del degradado. */
  colorPrimario?: MoradoInstitucional;
  /** Cierre del degradado del panel de marca. */
  colorDegradado?: MoradoInstitucional;
  onSubmit?: (credenciales: Credenciales) => void;
  onOlvidoPassword?: () => void;
}

/** Etapas del ciclo PDCA. El orden es información, no decoración. */
const ETAPAS = [
  { nombre: 'Planificar', Icono: IconoPlanificar },
  { nombre: 'Ejecutar', Icono: IconoEjecutar },
  { nombre: 'Verificar', Icono: IconoVerificar },
  { nombre: 'Mejorar', Icono: IconoMejorar },
] as const;

export function LoginPage({
  colorPrimario = '#6802C1',
  colorDegradado = '#57019F',
  onSubmit,
  onOlvidoPassword,
}: LoginPageProps) {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const idCorreo = useId();
  const idPassword = useId();

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    onSubmit?.({ correo, password });
  }

  return (
    <div
      className="uc-login"
      style={
        {
          '--uc-primary': colorPrimario,
          '--uc-gradient-end': colorDegradado,
        } as CSSProperties
      }
    >
      <div className="uc-card">
        {/* ── Panel de marca ─────────────────────────────────────────── */}
        <section className="uc-brand">
          <div className="uc-brand__orb uc-brand__orb--tr" />
          <div className="uc-brand__orb uc-brand__orb--bl" />

          <LogotipoUC />

          <div>
            <p className="uc-brand__eyebrow">Sistema de Gestión de Calidad</p>
            <h1 className="uc-brand__title">Gestión de Calidad y Mejora Continua</h1>
            <hr className="uc-brand__rule" />
            <p className="uc-brand__tagline">Excelencia que transforma</p>
          </div>

          <div className="uc-cycle">
            <h2 className="uc-cycle__title">Ciclo de mejora continua</h2>
            <ol className="uc-cycle__steps">
              {ETAPAS.map(({ nombre, Icono }, indice) => (
                <li key={nombre} className="uc-cycle__item">
                  <div className="uc-cycle__step">
                    <span
                      className={`uc-cycle__icon ${
                        indice % 2 === 0 ? 'uc-cycle__icon--light' : 'uc-cycle__icon--dark'
                      }`}
                    >
                      <Icono />
                    </span>
                    <span className="uc-cycle__label">{nombre}</span>
                  </div>
                  {/* La última etapa lo oculta por CSS, pero conserva el hueco
                      para que las cuatro columnas midan lo mismo. */}
                  <span className="uc-cycle__arrow">
                    <FlechaConector />
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <p className="uc-brand__foot">
            <IconoEscudo />
            Universidad Continental — Dirección de Calidad Académica
          </p>
        </section>

        {/* ── Panel de acceso ────────────────────────────────────────── */}
        <section className="uc-access">
          <div className="uc-access__inner">
            <IsotipoUC />

            <p className="uc-access__eyebrow">Portal de acceso institucional</p>
            <h2 className="uc-access__title">Bienvenido</h2>
            <p className="uc-access__sub">Ingresa tus credenciales para continuar</p>

            <form onSubmit={manejarEnvio} noValidate>
              <div className="uc-field">
                <label className="uc-field__label" htmlFor={idCorreo}>
                  Correo institucional
                </label>
                <div className="uc-field__control">
                  <input
                    id={idCorreo}
                    className="uc-input"
                    type="email"
                    name="correo"
                    autoComplete="username"
                    placeholder="nombre@continental.edu.pe"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="uc-field">
                <label className="uc-field__label" htmlFor={idPassword}>
                  Contraseña
                </label>
                <div className="uc-field__control">
                  <input
                    id={idPassword}
                    className="uc-input uc-input--password"
                    type={passwordVisible ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="uc-eye"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={passwordVisible}
                    aria-controls={idPassword}
                  >
                    {passwordVisible ? <IconoOjoTachado /> : <IconoOjo />}
                  </button>
                </div>
              </div>

              <a
                className="uc-forgot"
                href="#recuperar"
                onClick={(e) => {
                  if (onOlvidoPassword) {
                    e.preventDefault();
                    onOlvidoPassword();
                  }
                }}
              >
                ¿Olvidaste tu contraseña?
              </a>

              <button type="submit" className="uc-submit">
                Iniciar sesión
              </button>
            </form>

            <hr className="uc-sep" />

            <p className="uc-note">
              Acceso exclusivo para personal autorizado de la Universidad Continental. Toda
              actividad es registrada.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
