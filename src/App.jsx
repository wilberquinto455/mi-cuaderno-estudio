import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase.js';
import { extractStudyText, splitIntoChunks } from './documentText.js';

const starterCategories = [
  { name: 'CCNA 200-301', description: 'Redes, switching, routing y seguridad.', color: '#5d7fa9' },
  { name: 'BlueCat', description: 'DNS, DHCP e IPAM.', color: '#3c8a8a' },
  { name: 'Bases de datos', description: 'SQL, diseño y consultas.', color: '#a76c76' },
  { name: 'Linux', description: 'Comandos, administración y laboratorios.', color: '#8572a6' },
  { name: 'Universidad', description: 'Cursos, proyectos y apuntes.', color: '#af8555' },
  { name: 'Lógica de programación', description: 'Conceptos y ejercicios.', color: '#5b8c68' },
];

const emptyNote = (categoryId = '') => ({
  id: null,
  title: '',
  body: '',
  category_id: categoryId,
  visibility: 'private',
});

function getPublicNoteId() {
  return new URLSearchParams(window.location.hash.slice(1)).get('nota');
}

function renderInlineMarkdown(text) {
  const tokenPattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  return String(text).split(tokenPattern).filter(Boolean).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('__') && token.endsWith('__')) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith('*') && token.endsWith('*')) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith('_') && token.endsWith('_')) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith('[')) {
      const match = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        try {
          const url = new URL(match[2].trim(), window.location.origin);
          if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
            const external = url.origin !== window.location.origin;
            return <a key={index} href={url.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{match[1]}</a>;
          }
        } catch { /* Show unsafe or malformed links as plain text. */ }
        return <span key={index}>{match[1]}</span>;
      }
    }
    return <span key={index}>{token}</span>;
  });
}

function MarkdownContent({ text, className = '' }) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  const tableCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  const isTableSeparator = line => tableCells(line).length > 1 && tableCells(line).every(cell => /^:?-{3,}:?$/.test(cell));
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (/^\s*```/.test(line)) {
      const language = line.trim().slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code className={language ? `language-${language}` : undefined}>{code.join('\n')}</code></pre>);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headers = tableCells(line);
      const alignments = tableCells(lines[index + 1]).map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(<div className="markdown-table-wrap" key={`table-${index}`}><table className="markdown-table"><thead><tr>{headers.map((cell, column) => <th key={column} style={{ textAlign: alignments[column] || 'left' }}>{renderInlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, column) => <td key={column} style={{ textAlign: alignments[column] || 'left' }}>{renderInlineMarkdown(row[column] || '')}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length, 4)}`;
      blocks.push(<Tag key={`heading-${index}`}>{renderInlineMarkdown(heading[2])}</Tag>);
      index += 1;
      continue;
    }

    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((part, partIndex) => <p key={partIndex}>{renderInlineMarkdown(part)}</p>)}</blockquote>);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={index}>{renderInlineMarkdown(item[1])}</li>);
        index += 1;
      }
      const List = isOrdered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`}>{items}</List>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+/.test(lines[index]) && !/^\s*```/.test(lines[index]) && !(lines[index].includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) && !/^\s*>\s?/.test(lines[index]) && !/^\s*[-*+]\s+/.test(lines[index]) && !/^\s*\d+[.)]\s+/.test(lines[index]) && !/^\s*([-*_]\s*){3,}$/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((part, partIndex) => <Fragment key={partIndex}>{partIndex > 0 && <br />}{renderInlineMarkdown(part)}</Fragment>)}</p>);
  }
  return <div className={`markdown-content ${className}`.trim()}>{blocks}</div>;
}

function PublicNote() {
  const [note, setNote] = useState(null);
  const [status, setStatus] = useState('Cargando nota…');

  useEffect(() => {
    let active = true;
    const id = getPublicNoteId();
    supabase.from('study_notes').select('title, body, published_at, created_at')
      .eq('id', id).eq('visibility', 'public').maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) setStatus('Esta nota no existe o ya no está publicada.');
        else { setNote(data); setStatus(''); }
      });
    return () => { active = false; };
  }, []);

  return <main className="public-page"><a href={window.location.pathname} className="brand-link">← Estudio Guía</a>
    {note ? <article className="public-note"><span className="eyebrow">APUNTE PÚBLICO</span><h1>{note.title}</h1><p className="public-date">Publicado {new Date(note.published_at || note.created_at).toLocaleDateString('es')}</p><MarkdownContent text={note.body} className="note-content" /></article> : <p className="text-secondary mt-5">{status}</p>}
  </main>;
}

function SetupNotice() {
  return <main className="setup-wrap"><section className="setup-card"><div className="brand-mark">EG</div><span className="eyebrow">CONFIGURACIÓN INICIAL</span><h1>Conecta tu proyecto de Supabase</h1><p>La aplicación ya está preparada. Falta configurar la URL del proyecto y su clave pública local.</p><ol>
    <li>En Supabase, usa <strong>Project URL</strong> y <strong>Publishable key</strong> (`sb_publishable_…`).</li>
    <li>Crea un archivo <code>.env.local</code> junto a <code>package.json</code>.</li>
    <li>Añade <code>VITE_SUPABASE_URL=…</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY=…</code>.</li>
    <li>Reinicia el servidor local con <code>pnpm dev</code>.</li>
  </ol><p className="small text-secondary mb-0">No uses la clave <code>sb_secret_…</code> en el navegador. La clave secreta nunca debe ir en el frontend.</p></section></main>;
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function requestPasswordReset() {
    if (!email.trim()) { setMessage('Escribe tu correo para enviarte el enlace de recuperación.'); return; }
    setBusy(true); setMessage('');
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    setMessage(error ? error.message : 'Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña. Revisa también spam.');
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString() } });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');
    else setMessage('');
  }

  return <main className="auth-wrap"><section className="auth-card"><div className="brand-mark">EG</div><span className="eyebrow">TU BIBLIOTECA PERSONAL</span><h1>{mode === 'login' ? 'Qué bueno verte' : 'Crea tu cuenta'}</h1><p className="text-secondary">Guarda lo que aprendes. Encuéntralo cuando lo necesites.</p>
    <form onSubmit={submit} className="mt-4"><label className="form-label" htmlFor="email">Correo electrónico</label><input id="email" className="form-control mb-3" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <label className="form-label" htmlFor="password">Contraseña</label><input id="password" className="form-control" type="password" minLength="6" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={e => setPassword(e.target.value)} />
      {message && <div className="alert alert-info mt-3 mb-0" role="status">{message}</div>}
      <button className="btn btn-primary w-100 mt-4" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</button>
    </form>{mode === 'login' && <p className="auth-switch mb-0"><button type="button" className="link-button" disabled={busy} onClick={requestPasswordReset}>Olvidé mi contraseña</button></p>}<p className="auth-switch">{mode === 'login' ? '¿Primera vez aquí?' : '¿Ya tienes cuenta?'} <button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}</button></p>
  </section></main>;
}

function PasswordRecoveryScreen({ onComplete }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage(error.message);
    else { setSaved(true); setMessage('Contraseña actualizada correctamente.'); }
  }

  return <main className="auth-wrap"><section className="auth-card"><div className="brand-mark">EG</div><span className="eyebrow">RECUPERACIÓN DE CUENTA</span><h1>Elige una contraseña nueva</h1><p className="text-secondary">Usa al menos 6 caracteres.</p><form onSubmit={submit} className="mt-4"><label className="form-label" htmlFor="new-password">Nueva contraseña</label><input id="new-password" className="form-control" type="password" minLength="6" autoComplete="new-password" required disabled={saved} value={password} onChange={e => setPassword(e.target.value)} />{message && <div className="alert alert-info mt-3 mb-0" role="status">{message}</div>}<button className="btn btn-primary w-100 mt-4" disabled={busy || saved}>{busy ? 'Guardando…' : saved ? 'Contraseña guardada' : 'Guardar contraseña'}</button>{saved && <button type="button" className="btn btn-outline-primary w-100 mt-2" onClick={onComplete}>Volver a mi biblioteca</button>}</form></section></main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [categories, setCategories] = useState([]);
  const [notes, setNotes] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [draftsReady, setDraftsReady] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [currentNote, setCurrentNote] = useState(emptyNote());
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [draftStatus, setDraftStatus] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [question, setQuestion] = useState('');
  const [ragAnswer, setRagAnswer] = useState(null);
  const [ragSources, setRagSources] = useState([]);
  const [asking, setAsking] = useState(false);
  const [notePreview, setNotePreview] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) { setAuthReady(true); return undefined; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setCategories([]); setNotes([]); setDrafts([]); setDraftsReady(false); setDocuments([]); return; }
    let active = true;
    (async () => {
      const userId = session.user.id;
      const catResult = await supabase.from('study_categories').select('*').eq('user_id', userId).order('name');
      if (catResult.error) { setNotice(catResult.error.message); return; }
      let categoryRows = catResult.data || [];
      if (!categoryRows.length) {
        // React StrictMode can run this effect twice during development. Use the
        // unique (user_id, name) key so concurrent initial seeding is safe.
        const seeded = await supabase.from('study_categories').upsert(
          starterCategories.map(c => ({ ...c, user_id: userId })),
          { onConflict: 'user_id,name', ignoreDuplicates: true },
        );
        if (seeded.error) { setNotice(seeded.error.message); return; }
        const refreshed = await supabase.from('study_categories').select('*').eq('user_id', userId).order('name');
        if (refreshed.error) { setNotice(refreshed.error.message); return; }
        categoryRows = refreshed.data || [];
      }
      const [noteResult, docResult, draftResult] = await Promise.all([
        supabase.from('study_notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        supabase.from('study_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('study_note_drafts').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
      ]);
      if (!active) return;
      if (noteResult.error || docResult.error) setNotice(noteResult.error?.message || docResult.error?.message || 'No se pudo cargar la biblioteca.');
      else { setCategories(categoryRows); setNotes(noteResult.data || []); setDocuments(docResult.data || []); }
      if (draftResult.error) {
        setDraftsReady(false);
        setNotice('Para activar los borradores sincronizados, ejecuta supabase/004_note_drafts.sql en el SQL Editor.');
      } else { setDrafts(draftResult.data || []); setDraftsReady(true); }
    })();
    return () => { active = false; };
  }, [session]);

  const visibleNotes = useMemo(() => notes.filter(note =>
    (activeCategory === 'all' || note.category_id === activeCategory) &&
    (!search || `${note.title} ${note.body}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  ), [notes, activeCategory, search]);

  const currentCategory = categories.find(c => c.id === currentNote.category_id);
  const visibleDocuments = documents.filter(doc => activeCategory === 'all' || doc.category_id === activeCategory);
  const visibleDrafts = drafts.filter(draft => activeCategory === 'all' || draft.category_id === activeCategory);
  const persistedCurrentNote = currentNote.id ? notes.find(note => note.id === currentNote.id) : null;
  const currentNoteDirty = currentNote.id
    ? Boolean(persistedCurrentNote && (persistedCurrentNote.title !== currentNote.title || persistedCurrentNote.body !== currentNote.body || persistedCurrentNote.category_id !== currentNote.category_id || persistedCurrentNote.visibility !== currentNote.visibility))
    : Boolean(currentNote.title.trim() || currentNote.body.trim());

  async function persistDraft(note, preferredId = null) {
    if (!session || !draftsReady) return { error: new Error('Los borradores sincronizados aún no están disponibles.') };
    const noteId = note.id || null;
    const values = {
      user_id: session.user.id,
      note_id: noteId,
      category_id: note.category_id || null,
      title: note.title || '',
      body: note.body || '',
      visibility: note.visibility || 'private',
    };
    let existing = drafts.find(draft => draft.id === preferredId) || drafts.find(draft => draft.note_id === noteId);
    let result = existing
      ? await supabase.from('study_note_drafts').update(values).eq('id', existing.id).eq('user_id', session.user.id).select().single()
      : await supabase.from('study_note_drafts').insert(values).select().single();

    if (result.error?.code === '23505') {
      let query = supabase.from('study_note_drafts').select('*').eq('user_id', session.user.id);
      query = noteId ? query.eq('note_id', noteId) : query.is('note_id', null);
      const collision = await query.maybeSingle();
      if (collision.data) result = await supabase.from('study_note_drafts').update(values).eq('id', collision.data.id).eq('user_id', session.user.id).select().single();
    }
    if (result.error) return { error: result.error };
    setDrafts(previous => [result.data, ...previous.filter(draft => draft.id !== result.data.id)]);
    return { data: result.data };
  }

  useEffect(() => {
    if (!session || !draftsReady || !currentNoteDirty) { setDraftStatus(''); return undefined; }
    const existing = drafts.find(draft => draft.id === currentDraftId) || drafts.find(draft => draft.note_id === (currentNote.id || null));
    const alreadySaved = existing && existing.title === currentNote.title && existing.body === currentNote.body && existing.category_id === (currentNote.category_id || null) && existing.visibility === currentNote.visibility;
    if (alreadySaved) { setCurrentDraftId(existing.id); setDraftStatus('saved'); return undefined; }

    setDraftStatus('pending');
    const timeout = window.setTimeout(async () => {
      setDraftStatus('saving');
      const result = await persistDraft(currentNote, currentDraftId);
      if (result.error) setDraftStatus('error');
      else { setCurrentDraftId(result.data.id); setDraftStatus('saved'); }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [session, draftsReady, currentNoteDirty, currentNote, currentDraftId, drafts]);

  async function refreshLibrary() {
    if (!session) return;
    const [catResult, noteResult, docResult] = await Promise.all([
      supabase.from('study_categories').select('*').eq('user_id', session.user.id).order('name'),
      supabase.from('study_notes').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false }),
      supabase.from('study_documents').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
    ]);
    if (catResult.error || noteResult.error || docResult.error) { setNotice('No se pudo actualizar la biblioteca.'); return; }
    setCategories(catResult.data || []); setNotes(noteResult.data || []); setDocuments(docResult.data || []);
    const draftResult = await supabase.from('study_note_drafts').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false });
    if (draftResult.error) { setDraftsReady(false); setDrafts([]); }
    else { setDrafts(draftResult.data || []); setDraftsReady(true); }
  }

  async function flushCurrentDraft() {
    if (!currentNoteDirty) return true;
    if (!draftsReady) {
      setNotice('Ejecuta supabase/004_note_drafts.sql en Supabase para activar el guardado de borradores.');
      return false;
    }
    const result = await persistDraft(currentNote, currentDraftId);
    if (result.error) {
      setDraftStatus('error');
      setNotice('No se pudo guardar el borrador. Revisa tu conexión antes de cambiar de apunte.');
      return false;
    }
    setCurrentDraftId(result.data.id);
    setDraftStatus('saved');
    return result.data;
  }

  async function openNote(note) {
    if (currentNote.id === note.id) {
      if (!(await flushCurrentDraft())) return;
      setNotePreview(false);
      return;
    }
    if (!(await flushCurrentDraft())) return;
    const draft = drafts.find(item => item.note_id === note.id);
    setCurrentNote(draft
      ? { id: note.id, title: draft.title, body: draft.body, category_id: draft.category_id || '', visibility: draft.visibility }
      : note);
    setCurrentDraftId(draft?.id || null);
    setNotePreview(false);
  }

  async function openDraft(draft) {
    if (currentDraftId === draft.id) { setNotePreview(false); return; }
    if (!(await flushCurrentDraft())) return;
    setCurrentNote({ id: draft.note_id, title: draft.title, body: draft.body, category_id: draft.category_id || '', visibility: draft.visibility });
    setCurrentDraftId(draft.id);
    setNotePreview(false);
  }

  async function startNewNote() {
    if (!(await flushCurrentDraft())) return;
    if (!currentNote.id && currentNoteDirty) {
      setNotice('Ya tienes un borrador de apunte nuevo; continúa redactándolo o guárdalo antes de empezar otro.');
      return;
    }
    const draft = drafts.find(item => item.note_id === null);
    if (draft && draft.id !== currentDraftId) return openDraft(draft);
    setCurrentNote(emptyNote(activeCategory === 'all' ? categories[0]?.id : activeCategory));
    setCurrentDraftId(null);
    setNotePreview(false);
  }

  async function saveNote(event) {
    event.preventDefault();
    const flushedDraft = draftsReady ? await flushCurrentDraft() : true;
    if (!flushedDraft) return;
    const draftIdToDelete = currentDraftId || (flushedDraft === true ? null : flushedDraft.id);
    setBusy(true); setNotice('');
    const values = { title: currentNote.title.trim(), body: currentNote.body, category_id: currentNote.category_id || null, visibility: currentNote.visibility, published_at: currentNote.visibility === 'public' ? new Date().toISOString() : null };
    const result = currentNote.id
      ? await supabase.from('study_notes').update(values).eq('id', currentNote.id).select().single()
      : await supabase.from('study_notes').insert({ ...values, user_id: session.user.id }).select().single();
    setBusy(false);
    if (result.error) { setNotice(result.error.message); return; }
    let draftDeleteIssue = '';
    if (draftsReady && draftIdToDelete) {
      const deletedDraft = await supabase.from('study_note_drafts').delete().eq('id', draftIdToDelete).eq('user_id', session.user.id);
      if (deletedDraft.error) draftDeleteIssue = 'Apunte guardado. No se pudo eliminar el borrador anterior; puedes abrirlo desde la lista de borradores.';
      else setDrafts(previous => previous.filter(draft => draft.id !== draftIdToDelete));
    }
    setCurrentDraftId(null); setDraftStatus('');
    await refreshLibrary(); setCurrentNote(result.data);
    const noteText = [result.data.title, result.data.body].filter(Boolean).join('\n\n');
    const indexed = await supabase.functions.invoke('study-rag', { body: {
      action: 'index', sourceType: 'note', sourceId: result.data.id,
      categoryId: result.data.category_id, title: result.data.title,
      chunks: splitIntoChunks(noteText),
    } });
    setNotice(draftDeleteIssue || (indexed.error
      ? `Apunte guardado, pero no se pudo indexar: ${indexed.error.message}`
      : indexed.data?.indexed
        ? `Apunte guardado e indexado (${indexed.data.indexed} fragmentos).`
        : 'Apunte guardado, pero no contiene texto para indexar.'));
  }

  async function addCategory() {
    const name = window.prompt('Nombre de la nueva categoría:');
    if (!name?.trim()) return;
    const result = await supabase.from('study_categories').insert({ user_id: session.user.id, name: name.trim() }).select().single();
    if (result.error) setNotice(result.error.message);
    else { await refreshLibrary(); setActiveCategory(result.data.id); setNotice('Categoría creada.'); }
  }

  async function uploadFiles(event) {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length) return;
    setBusy(true); setNotice('Subiendo documentos…');
    let uploadIssue = '';
    for (const file of files) {
      const documentId = crypto.randomUUID();
      const storagePath = `${session.user.id}/${documentId}/${file.name}`;
      const uploaded = await supabase.storage.from('study-files').upload(storagePath, file, { upsert: false });
      if (uploaded.error) { uploadIssue = `No se pudo subir ${file.name}: ${uploaded.error.message}`; continue; }
      const saved = await supabase.from('study_documents').insert({
        id: documentId, user_id: session.user.id, category_id: activeCategory === 'all' ? currentNote.category_id || null : activeCategory,
        note_id: currentNote.id || null, file_name: file.name, storage_path: storagePath,
        mime_type: file.type || null, size_bytes: file.size, processing_status: 'uploaded',
      });
      if (saved.error) {
        await supabase.storage.from('study-files').remove([storagePath]);
        uploadIssue = `El archivo subió, pero no se pudo registrar: ${saved.error.message}`;
        continue;
      }
      await supabase.from('study_documents').update({ processing_status: 'processing', processing_error: null }).eq('id', documentId);
      try {
        const extractedText = await extractStudyText(file);
        const indexed = await supabase.functions.invoke('study-rag', { body: {
          action: 'index', sourceType: 'document', sourceId: documentId,
          categoryId: activeCategory === 'all' ? currentNote.category_id || null : activeCategory,
          title: file.name, chunks: splitIntoChunks(extractedText),
        } });
        if (indexed.error) throw new Error(indexed.error.message);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo indexar el documento.';
        await supabase.from('study_documents').update({ processing_status: 'error', processing_error: message }).eq('id', documentId);
        uploadIssue = `${file.name} se guardó, pero no se indexó: ${message}`;
      }
    }
    setBusy(false); await refreshLibrary();
    setNotice(uploadIssue || 'Documentos guardados en tu biblioteca privada.');
  }

  async function openDocument(doc) {
    const result = await supabase.storage.from('study-files').createSignedUrl(doc.storage_path, 60);
    if (result.error) setNotice(result.error.message);
    else window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function openRagSource(source) {
    if (source.noteId) {
      const note = notes.find(item => item.id === source.noteId);
      if (!note) { setNotice('No se encontró el apunte de esta fuente en tu biblioteca.'); return; }
      const saved = note.id ? notes.find(item => item.id === currentNote.id) : null;
      const hasUnsavedChanges = currentNote.id
        ? Boolean(saved && (saved.title !== currentNote.title || saved.body !== currentNote.body || saved.category_id !== currentNote.category_id || saved.visibility !== currentNote.visibility))
        : Boolean(currentNote.title.trim() || currentNote.body.trim());
      if (hasUnsavedChanges && !window.confirm('Tienes cambios sin guardar en el editor. ¿Quieres abrir la fuente de todas formas?')) return;
      await openNote(note);
      setActiveCategory(note.category_id || 'all');
      setSearch('');
      return;
    }
    if (source.documentId) {
      const doc = documents.find(item => item.id === source.documentId);
      if (!doc) { setNotice('No se encontró el documento de esta fuente en tu biblioteca.'); return; }
      await openDocument(doc);
    }
  }

  async function deleteDocument(doc) {
    if (!window.confirm(`¿Eliminar “${doc.file_name}”?`)) return;
    const removed = await supabase.storage.from('study-files').remove([doc.storage_path]);
    if (removed.error) { setNotice(removed.error.message); return; }
    const result = await supabase.from('study_documents').delete().eq('id', doc.id);
    if (result.error) setNotice(result.error.message); else { setNotice('Documento eliminado.'); await refreshLibrary(); }
  }

  async function askLibrary(event) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion) return;
    setAsking(true); setRagAnswer(null); setRagSources([]);
    try {
      const { data, error } = await supabase.functions.invoke('study-rag', { body: {
        action: 'ask', question: submittedQuestion, categoryId: activeCategory === 'all' ? null : activeCategory,
      } });
      if (error) setRagAnswer(`No se pudo consultar la biblioteca: ${error.message}`);
      else { setRagAnswer(data.answer); setRagSources(data.sources || []); }
    } catch (error) {
      setRagAnswer(`No se pudo consultar la biblioteca: ${error instanceof Error ? error.message : 'Error inesperado.'}`);
    } finally {
      setAsking(false);
    }
  }

  async function copyPublicLink() {
    const link = `${window.location.origin}${window.location.pathname}#nota=${currentNote.id}`;
    await navigator.clipboard.writeText(link);
    setNotice('Enlace público copiado. La nota solo se verá mientras esté publicada.');
  }

  if (getPublicNoteId() && supabaseConfigured) return <PublicNote />;
  if (!supabaseConfigured) return <SetupNotice />;
  if (!authReady) return <div className="loading-screen">Preparando tu biblioteca…</div>;
  if (passwordRecovery && session) return <PasswordRecoveryScreen onComplete={() => setPasswordRecovery(false)} />;
  if (!session) return <AuthScreen />;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <a className="sidebar-brand" href="#"><span className="brand-mark small-mark">EG</span><span>Estudio Guía<small>Tu conocimiento, ordenado</small></span></a>
      <div className="sidebar-label">BIBLIOTECA</div>
      <button className={`side-link ${activeCategory === 'all' ? 'active' : ''}`} onClick={() => { setActiveCategory('all'); setMobileMenu(false); }}><span className="side-icon">▦</span>Todos los apuntes<span className="side-count">{notes.length}</span></button>
      <div className="category-heading"><span className="sidebar-label mb-0">CATEGORÍAS</span><button className="icon-button light" aria-label="Crear categoría" onClick={addCategory}>＋</button></div>
      <nav className="category-list">{categories.map(category => <button key={category.id} className={`side-link ${activeCategory === category.id ? 'active' : ''}`} onClick={() => { setActiveCategory(category.id); setMobileMenu(false); }}><span className="category-dot" style={{ background: category.color }} />{category.name}<span className="side-count">{notes.filter(n => n.category_id === category.id).length}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="user-avatar">{session.user.email?.[0]?.toUpperCase() || 'U'}</div><div className="user-label"><strong>Mi biblioteca</strong><small>{session.user.email}</small></div><button className="icon-button light" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => supabase.auth.signOut()}>↪</button></div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}

    <main className="main-area">
      <header className="topbar"><button className="icon-button menu-toggle" onClick={() => setMobileMenu(true)} aria-label="Abrir menú">☰</button><div className="breadcrumbs">Biblioteca <span>/</span> {activeCategory === 'all' ? 'Todos los apuntes' : categories.find(c => c.id === activeCategory)?.name}</div><div className="topbar-spacer" /><span className="private-label"><span /> Privado</span></header>
      <div className="workspace">
        <section className="library-column">
          <div className="page-heading"><div><span className="eyebrow">ESPACIO DE ESTUDIO</span><h1>{activeCategory === 'all' ? 'Tu biblioteca' : categories.find(c => c.id === activeCategory)?.name}</h1><p>Guarda tus apuntes, documentos y prácticas en un solo lugar.</p></div><button className="btn btn-primary" onClick={startNewNote}>＋ Nuevo apunte</button></div>
          <div className="library-toolbar"><div className="search-field"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en tus apuntes…" aria-label="Buscar apuntes" /></div><span className="result-count">{visibleNotes.length} {visibleNotes.length === 1 ? 'apunte' : 'apuntes'}</span></div>
          <section className="rag-panel">
            <div className="rag-heading"><span>✦</span><div><strong>Pregunta a tu biblioteca</strong><small>Respuestas basadas en tus notas y documentos privados.</small></div></div>
            <form className="rag-form" onSubmit={askLibrary}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ej.: ¿Cómo se calcula una subred IPv6?" aria-label="Pregunta para tu biblioteca" maxLength={1200} /><button className="btn btn-primary" disabled={asking || !question.trim()}>{asking ? 'Buscando…' : 'Preguntar'}</button></form>
            {ragAnswer && <div className="rag-answer" role="status"><MarkdownContent text={ragAnswer} className="rag-markdown" />{ragSources.length > 0 && <div className="rag-source-list"><strong>Fuentes usadas</strong>{ragSources.map((source, index) => <div className="rag-source-item" key={`${source.noteId || source.documentId || source.title}-${index}`}><div className="rag-source-heading"><span>[{index + 1}] {source.title}</span><button type="button" className="rag-source-open" onClick={() => openRagSource(source)}>{source.noteId ? 'Abrir apunte' : 'Abrir documento'} ↗</button></div>{source.excerpt && <details><summary>Ver fragmento consultado</summary><MarkdownContent text={source.excerpt} /></details>}</div>)}</div>}</div>}
          </section>
          {visibleDrafts.length > 0 && <section className="drafts-panel"><div className="drafts-heading"><div><h2>Borradores</h2><p>Guardados automáticamente y sincronizados con tu cuenta.</p></div><span>{visibleDrafts.length}</span></div><div className="drafts-list">{visibleDrafts.map(draft => <button type="button" className={`draft-row ${currentDraftId === draft.id ? 'selected' : ''}`} key={draft.id} onClick={() => openDraft(draft)}><span className="draft-icon">✎</span><span className="draft-row-main"><strong>{draft.title.trim() || 'Borrador sin título'}</strong><small>{draft.body.trim().slice(0, 100) || 'Empieza a redactar este apunte…'}</small></span><span className="draft-row-meta">{draft.note_id ? 'Cambios pendientes' : 'Nuevo apunte'}<small>{new Date(draft.updated_at).toLocaleDateString('es')}</small></span></button>)}</div></section>}
          <div className="notes-list">{visibleNotes.length ? visibleNotes.map(note => {
            const category = categories.find(c => c.id === note.category_id);
            return <button key={note.id} className={`note-row ${currentNote.id === note.id ? 'selected' : ''}`} onClick={() => openNote(note)}><span className="note-file-icon">▤</span><span className="note-row-main"><strong>{note.title || 'Sin título'}</strong><span>{note.body?.slice(0, 115) || 'Apunte sin contenido todavía'}</span></span><span className="note-row-meta">{category?.name || 'Sin categoría'}<small>{new Date(note.updated_at).toLocaleDateString('es')}</small></span><span className={`visibility-pill ${note.visibility}`}>{note.visibility === 'public' ? 'Público' : 'Privado'}</span></button>;
          }) : visibleDrafts.length === 0 && <div className="empty-state"><div className="empty-illustration">▤</div><h2>Aún no hay apuntes</h2><p>Crea el primer apunte de esta categoría para empezar a construir tu biblioteca.</p><button className="btn btn-outline-primary" onClick={startNewNote}>Crear un apunte</button></div>}</div>
          <div className="documents-panel"><div className="documents-heading"><div><h2>Documentos</h2><p>Archivos privados; indexamos PDF, TXT y MD.</p></div><label className="btn btn-outline-primary btn-sm mb-0">＋ Subir archivo<input type="file" hidden multiple accept=".pdf,.txt,.md" onChange={uploadFiles} disabled={busy} /></label></div>
            {visibleDocuments.length ? <div className="document-list">{visibleDocuments.map(doc => <div className="document-row" key={doc.id}><span className="doc-type">{doc.file_name.split('.').pop()?.slice(0, 4).toUpperCase()}</span><button className="document-name" onClick={() => openDocument(doc)}>{doc.file_name}<small>{(doc.size_bytes / 1024).toFixed(0)} KB · {doc.processing_status === 'ready' ? 'Indexado para búsqueda' : doc.processing_status === 'error' ? (doc.processing_error || 'No se pudo indexar') : doc.processing_status === 'processing' ? 'Procesando…' : 'Guardado'}</small></button><button className="icon-button" title="Eliminar documento" onClick={() => deleteDocument(doc)}>×</button></div>)}</div> : <div className="document-empty">Todavía no hay archivos. Súbelos para conservarlos de forma privada.</div>}
          </div>
        </section>

        <aside className="editor-column"><div className="editor-top"><div><span className="eyebrow">EDITOR DE APUNTES</span><div className="editor-status">{draftStatus === 'saving' ? 'Guardando borrador…' : draftStatus === 'pending' ? 'Cambios pendientes de guardar…' : draftStatus === 'saved' ? 'Borrador sincronizado' : draftStatus === 'error' ? 'No se pudo guardar el borrador' : !draftsReady ? 'Ejecuta migración 004 para sincronizar borradores' : currentNote.id ? 'Cambios guardados al actualizar' : 'Nuevo apunte'}</div></div>{currentNote.id && <button className="icon-button" title="Copiar enlace público" disabled={currentNote.visibility !== 'public'} onClick={copyPublicLink}>↗</button>}</div>
          <form onSubmit={saveNote} className="note-form"><input className="note-title-input" value={currentNote.title} onChange={e => setCurrentNote({ ...currentNote, title: e.target.value })} onBlur={flushCurrentDraft} placeholder="Título del apunte" aria-label="Título" required maxLength={180} />
            <div className="editor-controls"><select className="form-select form-select-sm" value={currentNote.category_id || ''} onChange={e => setCurrentNote({ ...currentNote, category_id: e.target.value })} aria-label="Categoría"><option value="">Sin categoría</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><select className="form-select form-select-sm visibility-select" value={currentNote.visibility} onChange={e => setCurrentNote({ ...currentNote, visibility: e.target.value })} aria-label="Visibilidad"><option value="private">Privado</option><option value="public">Publicado</option></select></div>
            <div className="markdown-editor-tabs" role="tablist" aria-label="Editor Markdown"><button type="button" role="tab" aria-selected={!notePreview} className={!notePreview ? 'active' : ''} onClick={() => setNotePreview(false)}>Redactar</button><button type="button" role="tab" aria-selected={notePreview} className={notePreview ? 'active' : ''} onClick={() => setNotePreview(true)}>Vista previa</button><span>Markdown: **negrita**, `código`, # título</span></div>
            {notePreview
              ? <div className="note-body-preview"><MarkdownContent text={currentNote.body || '*La vista previa de tu apunte aparecerá aquí.*'} /></div>
              : <textarea className="note-body-input" value={currentNote.body} onChange={e => setCurrentNote({ ...currentNote, body: e.target.value })} onBlur={flushCurrentDraft} placeholder={'Escribe lo que aprendiste…\n\nPuedes documentar conceptos, comandos, ejemplos y los pasos de tu laboratorio.'} />}
            <div className="editor-footer"><span>{currentNote.visibility === 'public' ? 'Esta nota podrá verla cualquiera con el enlace.' : 'Solo tú puedes ver esta nota.'}</span><button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar apunte'}</button></div>
          </form>
          {notice && <div className="notice" role="status">{notice}<button aria-label="Cerrar mensaje" onClick={() => setNotice('')}>×</button></div>}
          <div className="editor-hint"><span>✦</span><p><strong>Tu conocimiento crece contigo.</strong><br />Redacta con Markdown; los cambios se guardan como borrador y solo se publican al guardar el apunte.</p></div>
          <div className="category-context"><span className="context-dot" style={{ background: currentCategory?.color || '#cbd5e1' }} /><div><strong>{currentCategory?.name || 'Selecciona una categoría'}</strong><small>{currentCategory?.description || 'Organiza este apunte para encontrarlo después.'}</small></div></div>
        </aside>
      </div>
    </main>
  </div>;
}

export default App;
