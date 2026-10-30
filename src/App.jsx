import { useEffect, useMemo, useState } from 'react';
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
    {note ? <article className="public-note"><span className="eyebrow">APUNTE PÚBLICO</span><h1>{note.title}</h1><p className="public-date">Publicado {new Date(note.published_at || note.created_at).toLocaleDateString('es')}</p><div className="note-content">{note.body}</div></article> : <p className="text-secondary mt-5">{status}</p>}
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
    </form><p className="auth-switch">{mode === 'login' ? '¿Primera vez aquí?' : '¿Ya tienes cuenta?'} <button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}</button></p>
  </section></main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [categories, setCategories] = useState([]);
  const [notes, setNotes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [currentNote, setCurrentNote] = useState(emptyNote());
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [question, setQuestion] = useState('');
  const [ragAnswer, setRagAnswer] = useState(null);
  const [ragSources, setRagSources] = useState([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) { setAuthReady(true); return undefined; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setCategories([]); setNotes([]); setDocuments([]); return; }
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
      const [noteResult, docResult] = await Promise.all([
        supabase.from('study_notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        supabase.from('study_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);
      if (!active) return;
      if (noteResult.error || docResult.error) setNotice(noteResult.error?.message || docResult.error?.message || 'No se pudo cargar la biblioteca.');
      else { setCategories(categoryRows); setNotes(noteResult.data || []); setDocuments(docResult.data || []); }
    })();
    return () => { active = false; };
  }, [session]);

  const visibleNotes = useMemo(() => notes.filter(note =>
    (activeCategory === 'all' || note.category_id === activeCategory) &&
    (!search || `${note.title} ${note.body}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  ), [notes, activeCategory, search]);

  const currentCategory = categories.find(c => c.id === currentNote.category_id);
  const visibleDocuments = documents.filter(doc => activeCategory === 'all' || doc.category_id === activeCategory);

  async function refreshLibrary() {
    if (!session) return;
    const [catResult, noteResult, docResult] = await Promise.all([
      supabase.from('study_categories').select('*').eq('user_id', session.user.id).order('name'),
      supabase.from('study_notes').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false }),
      supabase.from('study_documents').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
    ]);
    if (catResult.error || noteResult.error || docResult.error) { setNotice('No se pudo actualizar la biblioteca.'); return; }
    setCategories(catResult.data || []); setNotes(noteResult.data || []); setDocuments(docResult.data || []);
  }

  async function saveNote(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    const values = { title: currentNote.title.trim(), body: currentNote.body, category_id: currentNote.category_id || null, visibility: currentNote.visibility, published_at: currentNote.visibility === 'public' ? new Date().toISOString() : null };
    const result = currentNote.id
      ? await supabase.from('study_notes').update(values).eq('id', currentNote.id).select().single()
      : await supabase.from('study_notes').insert({ ...values, user_id: session.user.id }).select().single();
    setBusy(false);
    if (result.error) { setNotice(result.error.message); return; }
    await refreshLibrary(); setCurrentNote(result.data);
    const noteText = [result.data.title, result.data.body].filter(Boolean).join('\n\n');
    const indexed = await supabase.functions.invoke('study-rag', { body: {
      action: 'index', sourceType: 'note', sourceId: result.data.id,
      categoryId: result.data.category_id, title: result.data.title,
      chunks: splitIntoChunks(noteText),
    } });
    setNotice(indexed.error ? `Apunte guardado. No se pudo indexar: ${indexed.error.message}` : 'Apunte guardado y añadido al buscador.');
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

  async function deleteDocument(doc) {
    if (!window.confirm(`¿Eliminar “${doc.file_name}”?`)) return;
    const removed = await supabase.storage.from('study-files').remove([doc.storage_path]);
    if (removed.error) { setNotice(removed.error.message); return; }
    const result = await supabase.from('study_documents').delete().eq('id', doc.id);
    if (result.error) setNotice(result.error.message); else { setNotice('Documento eliminado.'); await refreshLibrary(); }
  }

  async function askLibrary(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true); setRagAnswer(null); setRagSources([]);
    const { data, error } = await supabase.functions.invoke('study-rag', { body: {
      action: 'ask', question: question.trim(), categoryId: activeCategory === 'all' ? null : activeCategory,
    } });
    setAsking(false);
    if (error) setRagAnswer(`No se pudo consultar la biblioteca: ${error.message}`);
    else { setRagAnswer(data.answer); setRagSources(data.sources || []); }
  }

  async function copyPublicLink() {
    const link = `${window.location.origin}${window.location.pathname}#nota=${currentNote.id}`;
    await navigator.clipboard.writeText(link);
    setNotice('Enlace público copiado. La nota solo se verá mientras esté publicada.');
  }

  if (getPublicNoteId() && supabaseConfigured) return <PublicNote />;
  if (!supabaseConfigured) return <SetupNotice />;
  if (!authReady) return <div className="loading-screen">Preparando tu biblioteca…</div>;
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
          <div className="page-heading"><div><span className="eyebrow">ESPACIO DE ESTUDIO</span><h1>{activeCategory === 'all' ? 'Tu biblioteca' : categories.find(c => c.id === activeCategory)?.name}</h1><p>Guarda tus apuntes, documentos y prácticas en un solo lugar.</p></div><button className="btn btn-primary" onClick={() => setCurrentNote(emptyNote(activeCategory === 'all' ? categories[0]?.id : activeCategory))}>＋ Nuevo apunte</button></div>
          <div className="library-toolbar"><div className="search-field"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en tus apuntes…" aria-label="Buscar apuntes" /></div><span className="result-count">{visibleNotes.length} {visibleNotes.length === 1 ? 'apunte' : 'apuntes'}</span></div>
          <section className="rag-panel">
            <div className="rag-heading"><span>✦</span><div><strong>Pregunta a tu biblioteca</strong><small>Respuestas basadas en tus notas y documentos privados.</small></div></div>
            <form className="rag-form" onSubmit={askLibrary}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ej.: ¿Cómo se calcula una subred IPv6?" aria-label="Pregunta para tu biblioteca" maxLength={1200} /><button className="btn btn-primary" disabled={asking || !question.trim()}>{asking ? 'Buscando…' : 'Preguntar'}</button></form>
            {ragAnswer && <div className="rag-answer" role="status"><p>{ragAnswer}</p>{ragSources.length > 0 && <div className="rag-source-list"><strong>Fuentes</strong>{ragSources.map((source, index) => <span key={`${source.title}-${index}`}>[{index + 1}] {source.title}</span>)}</div>}</div>}
          </section>
          <div className="notes-list">{visibleNotes.length ? visibleNotes.map(note => {
            const category = categories.find(c => c.id === note.category_id);
            return <button key={note.id} className={`note-row ${currentNote.id === note.id ? 'selected' : ''}`} onClick={() => setCurrentNote(note)}><span className="note-file-icon">▤</span><span className="note-row-main"><strong>{note.title || 'Sin título'}</strong><span>{note.body?.slice(0, 115) || 'Apunte sin contenido todavía'}</span></span><span className="note-row-meta">{category?.name || 'Sin categoría'}<small>{new Date(note.updated_at).toLocaleDateString('es')}</small></span><span className={`visibility-pill ${note.visibility}`}>{note.visibility === 'public' ? 'Público' : 'Privado'}</span></button>;
          }) : <div className="empty-state"><div className="empty-illustration">▤</div><h2>Aún no hay apuntes</h2><p>Crea el primer apunte de esta categoría para empezar a construir tu biblioteca.</p><button className="btn btn-outline-primary" onClick={() => setCurrentNote(emptyNote(activeCategory === 'all' ? categories[0]?.id : activeCategory))}>Crear un apunte</button></div>}</div>
          <div className="documents-panel"><div className="documents-heading"><div><h2>Documentos</h2><p>Archivos privados; indexamos PDF, TXT y MD.</p></div><label className="btn btn-outline-primary btn-sm mb-0">＋ Subir archivo<input type="file" hidden multiple accept=".pdf,.txt,.md" onChange={uploadFiles} disabled={busy} /></label></div>
            {visibleDocuments.length ? <div className="document-list">{visibleDocuments.map(doc => <div className="document-row" key={doc.id}><span className="doc-type">{doc.file_name.split('.').pop()?.slice(0, 4).toUpperCase()}</span><button className="document-name" onClick={() => openDocument(doc)}>{doc.file_name}<small>{(doc.size_bytes / 1024).toFixed(0)} KB · {doc.processing_status === 'ready' ? 'Indexado para búsqueda' : doc.processing_status === 'error' ? (doc.processing_error || 'No se pudo indexar') : doc.processing_status === 'processing' ? 'Procesando…' : 'Guardado'}</small></button><button className="icon-button" title="Eliminar documento" onClick={() => deleteDocument(doc)}>×</button></div>)}</div> : <div className="document-empty">Todavía no hay archivos. Súbelos para conservarlos de forma privada.</div>}
          </div>
        </section>

        <aside className="editor-column"><div className="editor-top"><div><span className="eyebrow">EDITOR DE APUNTES</span><div className="editor-status">{currentNote.id ? 'Cambios guardados al actualizar' : 'Nuevo apunte'}</div></div>{currentNote.id && <button className="icon-button" title="Copiar enlace público" disabled={currentNote.visibility !== 'public'} onClick={copyPublicLink}>↗</button>}</div>
          <form onSubmit={saveNote} className="note-form"><input className="note-title-input" value={currentNote.title} onChange={e => setCurrentNote({ ...currentNote, title: e.target.value })} placeholder="Título del apunte" aria-label="Título" required maxLength={180} />
            <div className="editor-controls"><select className="form-select form-select-sm" value={currentNote.category_id || ''} onChange={e => setCurrentNote({ ...currentNote, category_id: e.target.value })} aria-label="Categoría"><option value="">Sin categoría</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><select className="form-select form-select-sm visibility-select" value={currentNote.visibility} onChange={e => setCurrentNote({ ...currentNote, visibility: e.target.value })} aria-label="Visibilidad"><option value="private">Privado</option><option value="public">Publicado</option></select></div>
            <textarea className="note-body-input" value={currentNote.body} onChange={e => setCurrentNote({ ...currentNote, body: e.target.value })} placeholder={'Escribe lo que aprendiste…\n\nPuedes documentar conceptos, comandos, ejemplos y los pasos de tu laboratorio.'} />
            <div className="editor-footer"><span>{currentNote.visibility === 'public' ? 'Esta nota podrá verla cualquiera con el enlace.' : 'Solo tú puedes ver esta nota.'}</span><button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar apunte'}</button></div>
          </form>
          {notice && <div className="notice" role="status">{notice}<button aria-label="Cerrar mensaje" onClick={() => setNotice('')}>×</button></div>}
          <div className="editor-hint"><span>✦</span><p><strong>Tu conocimiento crece contigo.</strong><br />Cuando conectemos el buscador RAG, podrás hacer preguntas sobre tus documentos y notas guardadas.</p></div>
          <div className="category-context"><span className="context-dot" style={{ background: currentCategory?.color || '#cbd5e1' }} /><div><strong>{currentCategory?.name || 'Selecciona una categoría'}</strong><small>{currentCategory?.description || 'Organiza este apunte para encontrarlo después.'}</small></div></div>
        </aside>
      </div>
    </main>
  </div>;
}

export default App;
