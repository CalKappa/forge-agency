// editor_folders: id uuid PK, project_id uuid FK projects, parent_folder_id uuid FK editor_folders nullable, name text, created_at timestamptz
// editor_files: id uuid PK, project_id uuid FK projects, folder_id uuid FK editor_folders nullable, filename text, content text, file_type text, file_size integer, created_at timestamptz, updated_at timestamptz

import { useEffect, useRef, useState } from 'react'

// CodeMirror core
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter,
         highlightSpecialChars, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle,
         bracketMatching, foldKeymap } from '@codemirror/language'
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search'
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'

// Language modes
import { html } from '@codemirror/lang-html'
import { css  } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'

// Prettier
import * as prettier        from 'prettier/standalone'
import * as prettierHtml    from 'prettier/plugins/html'
import * as prettierPostcss from 'prettier/plugins/postcss'
import * as prettierBabel   from 'prettier/plugins/babel'
import * as prettierEstree  from 'prettier/plugins/estree'

import { supabase }   from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { useConfirm } from '../context/ConfirmContext'
import { useToast }   from '../context/ToastContext'
import { saveFilesToDisk, openProjectFolder } from '../lib/fileSystemHelpers'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATIC_FILE_DEFS = [
  { agentName: 'Developer-CSS', label: 'styles.css', ext: 'css' },
  { agentName: 'Developer-JS',  label: 'script.js',  ext: 'js'  },
]

const TEXT_EXTS = ['html','css','js','json','md','txt','xml','svg','ts','tsx','jsx']

// ── Themes ────────────────────────────────────────────────────────────────────

const lightTheme = EditorView.theme({
  '&': { color: '#1a1a1a', backgroundColor: '#ffffff', height: '100%' },
  '.cm-scroller': { overflow: 'auto', fontFamily: '"Fira Code", "JetBrains Mono", monospace', fontSize: '13px' },
  '.cm-content': { caretColor: '#1a1a1a' },
  '.cm-gutters': { backgroundColor: '#f8f9fa', color: '#6e7681', border: 'none', borderRight: '1px solid #e1e4e8' },
  '.cm-activeLine': { backgroundColor: '#f0f7ff' },
  '.cm-activeLineGutter': { backgroundColor: '#dbeafe' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#3b82f630' },
  '.cm-cursor': { borderLeftColor: '#1a1a1a' },
  '.cm-panels': { backgroundColor: '#f3f4f6', color: '#1a1a1a', borderTop: '1px solid #e5e7eb' },
  '.cm-searchMatch': { backgroundColor: '#fef08a', outline: '1px solid #ca8a04' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#fde047' },
  '.cm-tooltip': { backgroundColor: '#ffffff', border: '1px solid #e5e7eb' },
  '.cm-foldGutter .cm-gutterElement': { cursor: 'pointer' },
}, { dark: false })

const darkBaseTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto', fontFamily: '"Fira Code", "JetBrains Mono", monospace', fontSize: '13px' },
})

// ── Extensions builder ────────────────────────────────────────────────────────

function buildExtensions(lang, themeComp, wrapComp, isDark, wordWrap, onUpdate, onSave) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    isDark ? darkBaseTheme : [],
    themeComp.of(isDark ? oneDark : lightTheme),
    wrapComp.of(wordWrap ? EditorView.lineWrapping : []),
    lang,
    EditorView.updateListener.of(onUpdate),
    keymap.of([
      { key: 'Mod-s', run: () => { onSave(); return true } },
      { key: 'Mod-h', run: view => { openSearchPanel(view); return true } },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ]
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Editor() {
  const confirm   = useConfirm()
  const showToast = useToast()

  const [clients,      setClients]      = useState([])
  const [projects,     setProjects]     = useState([])
  const [agentOutputs, setAgentOutputs] = useState([])
  const [loading,      setLoading]      = useState(true)

  const [selectedFile,   setSelectedFile]   = useState(null)
  const [savedContent,   setSavedContent]   = useState('')
  const [currentContent, setCurrentContent] = useState('')
  const [cursorLine,     setCursorLine]     = useState(1)
  const [cursorCol,      setCursorCol]      = useState(1)
  const [totalLines,     setTotalLines]     = useState(1)
  const [isDark,         setIsDark]         = useState(true)
  const [wordWrap,       setWordWrap]       = useState(() => localStorage.getItem('forge_editor_wordwrap') !== 'false')
  const [saving,         setSaving]         = useState(false)
  const [formatting,     setFormatting]     = useState(false)
  const [formatError,    setFormatError]    = useState(null)
  const [copied,         setCopied]         = useState(false)
  const [openClients,    setOpenClients]    = useState({})
  const [openProjects,   setOpenProjects]   = useState({})

  // Editor folders / files state
  const [editorFolders,    setEditorFolders]    = useState([])
  const [editorFiles,      setEditorFiles]      = useState([])
  const [openFolders,      setOpenFolders]      = useState({})
  const [newFolderTarget,  setNewFolderTarget]  = useState(null)
  const [newFolderName,    setNewFolderName]    = useState('')
  const [contextMenu,      setContextMenu]      = useState(null)
  const [renameTarget,     setRenameTarget]     = useState(null)
  const [renameName,       setRenameName]       = useState('')
  const [searchQuery,      setSearchQuery]      = useState('')
  const [dragOverFolderId, setDragOverFolderId] = useState(null)
  const [isDragOverPanel,  setIsDragOverPanel]  = useState(false)

  // Claude panel state
  const [chatMessages,    setChatMessages]    = useState([])
  const [chatInput,       setChatInput]       = useState('')
  const [showOverlay,     setShowOverlay]     = useState(false)
  const [pastingResponse, setPastingResponse] = useState(false)
  const [pasteWarning,    setPasteWarning]    = useState(null)
  const chatEndRef = useRef(null)

  const editorDomRef     = useRef(null)
  const viewRef          = useRef(null)
  const themeCompartment = useRef(new Compartment())
  const wrapCompartment  = useRef(new Compartment())
  const isDarkRef        = useRef(true)
  const wordWrapRef      = useRef(true)
  const saveRef          = useRef(null)
  const selectedFileRef  = useRef(null)
  const fileInputRef     = useRef(null)
  const newFolderInputRef = useRef(null)
  const renameInputRef   = useRef(null)

  // Keep refs in sync
  useEffect(() => { isDarkRef.current = isDark }, [isDark])
  useEffect(() => { wordWrapRef.current = wordWrap }, [wordWrap])
  useEffect(() => { selectedFileRef.current = selectedFile }, [selectedFile])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  // Auto-focus inline inputs
  useEffect(() => { if (newFolderTarget) newFolderInputRef.current?.focus() }, [newFolderTarget])
  useEffect(() => { if (renameTarget) renameInputRef.current?.focus() }, [renameTarget])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    function handler() { setContextMenu(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => { load() }, [])

  async function load() {
    const [clientsRes, projectsRes, outputsRes, foldersRes, filesRes] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('projects').select('id, name, client_id').order('name'),
      supabase
        .from('agent_outputs')
        .select('id, project_id, agent_name, output_text, created_at')
        .or('agent_name.like.Developer-HTML%,agent_name.eq.Developer-CSS,agent_name.eq.Developer-JS')
        .not('output_text', 'is', null),
      supabase.from('editor_folders').select('*').order('name'),
      supabase.from('editor_files').select('*').order('filename'),
    ])
    setClients(clientsRes.data ?? [])
    setProjects(projectsRes.data ?? [])
    setAgentOutputs((outputsRes.data ?? []).filter(o => o.output_text?.trim()))
    setEditorFolders(foldersRes.data ?? [])
    setEditorFiles(filesRes.data ?? [])
    setLoading(false)
  }

  // ── Build file tree ───────────────────────────────────────────────────────

  const tree = clients.map(client => {
    const clientProjects = projects.filter(p => p.client_id === client.id)
    const projectsWithFiles = clientProjects.map(project => {
      const projectOutputs = agentOutputs.filter(o => o.project_id === project.id)

      // HTML files: one entry per Developer-HTML* record
      const htmlFiles = projectOutputs
        .filter(o => o.agent_name.startsWith('Developer-HTML'))
        .map(record => {
          const suffix = record.agent_name.slice('Developer-HTML'.length)
          const label  = suffix.startsWith('-') ? suffix.slice(1) : 'index.html'
          return { agentName: record.agent_name, label, ext: 'html', recordId: record.id, content: record.output_text, projectId: project.id, projectName: project.name, clientName: client.name }
        })

      // CSS and JS files (exact match)
      const staticFiles = STATIC_FILE_DEFS.map(def => {
        const record = projectOutputs.find(o => o.agent_name === def.agentName)
        if (!record) return null
        return { ...def, recordId: record.id, content: record.output_text, projectId: project.id, projectName: project.name, clientName: client.name }
      }).filter(Boolean)

      const agentFiles = [...htmlFiles, ...staticFiles]

      // Editor folders for this project (root level)
      const projectFolders = editorFolders.filter(f => f.project_id === project.id && !f.parent_folder_id)
      // Editor files for this project at root (no folder)
      const projectRootFiles = editorFiles.filter(f => f.project_id === project.id && !f.folder_id)

      const hasContent = agentFiles.length > 0 || projectFolders.length > 0 || projectRootFiles.length > 0
      return { project, agentFiles, projectFolders, projectRootFiles }
    }).filter(p => p.agentFiles.length > 0 || p.projectFolders.length > 0 || p.projectRootFiles.length > 0)
    return { client, projects: projectsWithFiles }
  }).filter(c => c.projects.length > 0)

  // ── Search filtering ──────────────────────────────────────────────────────

  const q = searchQuery.toLowerCase().trim()

  function matchesSearch(name) {
    return !q || name.toLowerCase().includes(q)
  }

  function folderMatchesSearch(folder, depth = 0) {
    if (depth > 3) return false
    if (matchesSearch(folder.name)) return true
    const children = editorFolders.filter(f => f.parent_folder_id === folder.id)
    const childFiles = editorFiles.filter(f => f.folder_id === folder.id)
    return children.some(c => folderMatchesSearch(c, depth + 1)) || childFiles.some(f => matchesSearch(f.filename))
  }

  // ── CodeMirror lifecycle ──────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedFile || !editorDomRef.current) return

    if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null }

    const ext = selectedFile.ext ?? selectedFile.file_type ?? 'js'
    const lang = ext === 'html' ? html({ autoCloseTags: true })
               : ext === 'css'  ? css()
               : javascript()

    const tc   = themeCompartment.current
    const wc   = wrapCompartment.current
    const dark = isDarkRef.current
    const wrap = wordWrapRef.current

    const onUpdate = update => {
      if (update.docChanged) {
        setCurrentContent(update.state.doc.toString())
        setTotalLines(update.state.doc.lines)
      }
      const cursor = update.state.selection.main.head
      const line   = update.state.doc.lineAt(cursor)
      setCursorLine(line.number)
      setCursorCol(cursor - line.from + 1)
    }

    const state = EditorState.create({
      doc: selectedFile.content ?? '',
      extensions: buildExtensions(lang, tc, wc, dark, wrap, onUpdate, () => saveRef.current?.()),
    })

    const view = new EditorView({ state, parent: editorDomRef.current })
    viewRef.current = view

    const initialContent = selectedFile.content ?? ''
    setCurrentContent(initialContent)
    setSavedContent(initialContent)
    setTotalLines(state.doc.lines)
    setCursorLine(1); setCursorCol(1)
    setFormatError(null)

    return () => { view.destroy(); viewRef.current = null }
  }, [selectedFile])  // eslint-disable-line react-hooks/exhaustive-deps

  // Theme switch via compartment (no view recreation)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: themeCompartment.current.reconfigure(isDark ? oneDark : lightTheme) })
  }, [isDark])

  // Word wrap toggle via compartment (no view recreation)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []) })
    localStorage.setItem('forge_editor_wordwrap', String(wordWrap))
  }, [wordWrap])

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const file = selectedFileRef.current
    if (!file || saving) return
    const view = viewRef.current
    if (!view) return
    const content = view.state.doc.toString()
    setSaving(true)

    if (file.source === 'editor_file') {
      const { error } = await supabase
        .from('editor_files')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', file.id)
      if (!error) {
        setSavedContent(content)
        setEditorFiles(prev => prev.map(f => f.id === file.id ? { ...f, content } : f))
      }
    } else {
      // agent_outputs path — save revision then update
      const { data: existing } = await supabase
        .from('agent_outputs').select('output_text').eq('id', file.recordId).single()
      if (existing?.output_text) {
        await supabase.from('agent_output_revisions').insert({
          project_id:  file.projectId,
          agent_name:  file.agentName,
          output_text: existing.output_text,
          original_id: file.recordId,
        }).then(({ error }) => {
          if (error) console.warn('[Editor] Revision save failed (table may not exist):', error.message)
        })
      }
      const { error } = await safeUpdate('agent_outputs', file.recordId, { output_text: content })
      if (!error) {
        setSavedContent(content)
        setAgentOutputs(prev => prev.map(o => o.id === file.recordId ? { ...o, output_text: content } : o))
        if (file.clientName && file.projectName) {
          await saveFilesToDisk(file.clientName, file.projectName, [{ filename: file.label ?? file.filename ?? 'file', content }], showToast)
        }
      }
    }
    setSaving(false)
  }
  saveRef.current = handleSave

  // ── Format ────────────────────────────────────────────────────────────────

  async function handleFormat() {
    if (!selectedFile || !viewRef.current || formatting) return
    setFormatting(true)
    setFormatError(null)
    try {
      const ext     = selectedFile.ext ?? selectedFile.file_type ?? 'js'
      const content = viewRef.current.state.doc.toString()
      const parser  = ext === 'html' ? 'html'
                    : ext === 'css'  ? 'css'
                    : 'babel'
      const plugins = ext === 'html' ? [prettierHtml]
                    : ext === 'css'  ? [prettierPostcss]
                    : [prettierBabel, prettierEstree]
      const formatted = await prettier.format(content, { parser, plugins, tabWidth: 2, singleQuote: true, printWidth: 100 })
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted },
      })
      setCurrentContent(formatted)
    } catch (err) {
      setFormatError(err.message?.split('\n')[0] ?? 'Format failed')
    }
    setFormatting(false)
  }

  // ── Copy ──────────────────────────────────────────────────────────────────

  function handleCopy() {
    if (!viewRef.current) return
    navigator.clipboard.writeText(viewRef.current.state.doc.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  function handlePreview() {
    if (!selectedFile) return
    const getContent = (agentName) => {
      const rec = agentOutputs.find(o => o.project_id === selectedFile.projectId && o.agent_name === agentName)
      return rec?.output_text ?? ''
    }
    const currentDoc = viewRef.current?.state.doc.toString() ?? ''
    const htmlText = selectedFile.agentName === 'Developer-HTML' ? currentDoc : getContent('Developer-HTML')
    const cssText  = selectedFile.agentName === 'Developer-CSS'  ? currentDoc : getContent('Developer-CSS')
    const jsText   = selectedFile.agentName === 'Developer-JS'   ? currentDoc : getContent('Developer-JS')
    const combined = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${selectedFile.projectName ?? selectedFile.filename ?? 'Preview'}</title>
<style>
${cssText}
</style>
</head>
<body>
${htmlText}
<script>
${jsText}
</script>
</body>
</html>`
    window.open(URL.createObjectURL(new Blob([combined], { type: 'text/html' })), '_blank')
  }

  // ── Editor folders / files functions ─────────────────────────────────────

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name || !newFolderTarget) return
    const { data, error } = await supabase.from('editor_folders').insert({
      project_id: newFolderTarget.projectId,
      parent_folder_id: newFolderTarget.parentFolderId ?? null,
      name,
    }).select().single()
    if (!error && data) setEditorFolders(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewFolderTarget(null)
    setNewFolderName('')
  }

  async function handleFileUpload(files, projectId, folderId = null) {
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (TEXT_EXTS.includes(ext)) {
        const text = await file.text()
        await supabase.from('editor_files').insert({
          project_id: projectId, folder_id: folderId,
          filename: file.name, content: text,
          file_type: ext, file_size: file.size,
        })
      } else {
        const path = `${projectId}/${folderId ? folderId + '/' : ''}${file.name}`
        await supabase.storage.from('editor-assets').upload(path, file, { upsert: true })
        const { data: urlData } = supabase.storage.from('editor-assets').getPublicUrl(path)
        await supabase.from('editor_files').insert({
          project_id: projectId, folder_id: folderId,
          filename: file.name, content: urlData.publicUrl,
          file_type: ext, file_size: file.size,
        })
      }
    }
    await load()
  }

  async function commitRename() {
    const name = renameName.trim()
    if (!name || !renameTarget) return
    if (renameTarget.type === 'folder') {
      await supabase.from('editor_folders').update({ name }).eq('id', renameTarget.id)
      setEditorFolders(prev => prev.map(f => f.id === renameTarget.id ? { ...f, name } : f))
    } else {
      await supabase.from('editor_files').update({ filename: name }).eq('id', renameTarget.id)
      setEditorFiles(prev => prev.map(f => f.id === renameTarget.id ? { ...f, filename: name } : f))
      if (selectedFile?.source === 'editor_file' && selectedFile?.id === renameTarget.id) {
        setSelectedFile(prev => ({ ...prev, label: name, filename: name }))
      }
    }
    setRenameTarget(null)
    setRenameName('')
    setContextMenu(null)
  }

  async function deleteItem(item) {
    setContextMenu(null)
    const label = item.type === 'folder' ? `folder "${item.name}"` : `file "${item.name}"`
    const ok = await confirm({ title: 'Delete', message: `Delete ${label}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' })
    if (!ok) return
    const table = item.type === 'folder' ? 'editor_folders' : 'editor_files'
    await supabase.from(table).delete().eq('id', item.id)
    if (item.type === 'folder') setEditorFolders(prev => prev.filter(f => f.id !== item.id))
    else {
      setEditorFiles(prev => prev.filter(f => f.id !== item.id))
      if (selectedFile?.source === 'editor_file' && selectedFile?.id === item.id) setSelectedFile(null)
    }
  }

  async function moveFile(fileId, newFolderId) {
    await supabase.from('editor_files').update({ folder_id: newFolderId }).eq('id', fileId)
    setEditorFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: newFolderId } : f))
    setContextMenu(null)
  }

  async function duplicateFile(file) {
    const dotIdx = file.filename.lastIndexOf('.')
    const base   = dotIdx !== -1 ? file.filename.slice(0, dotIdx) : file.filename
    const ext    = dotIdx !== -1 ? file.filename.slice(dotIdx) : ''
    const newName = `${base}-copy${ext}`
    await supabase.from('editor_files').insert({
      project_id: file.project_id, folder_id: file.folder_id,
      filename: newName, content: file.content,
      file_type: file.file_type, file_size: file.file_size,
    })
    await load()
    setContextMenu(null)
  }

  // ── Panel-level OS file drop ──────────────────────────────────────────────

  function handlePanelDragOver(e) {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setIsDragOverPanel(true)
    }
  }

  function handlePanelDragLeave() { setIsDragOverPanel(false) }

  function handlePanelDrop(e) {
    e.preventDefault()
    setIsDragOverPanel(false)
    if (!e.dataTransfer.files.length) return
    const firstProject = projects[0]
    if (!firstProject) return
    handleFileUpload(Array.from(e.dataTransfer.files), firstProject.id, null)
  }

  // ── Claude send ──────────────────────────────────────────────────────────

  async function handleSend() {
    const message = chatInput.trim()
    if (!message) return
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: message }])

    const projectId = selectedFile?.projectId ?? null
    const getContent = (agentName) => {
      const rec = agentOutputs.find(o => o.project_id === projectId && o.agent_name === agentName)
      return rec?.output_text ?? ''
    }
    const htmlContent = projectId ? (selectedFile?.agentName === 'Developer-HTML' ? (viewRef.current?.state.doc.toString() ?? '') : getContent('Developer-HTML')) : ''
    const cssContent  = projectId ? (selectedFile?.agentName === 'Developer-CSS'  ? (viewRef.current?.state.doc.toString() ?? '') : getContent('Developer-CSS'))  : ''
    const jsContent   = projectId ? (selectedFile?.agentName === 'Developer-JS'   ? (viewRef.current?.state.doc.toString() ?? '') : getContent('Developer-JS'))   : ''

    const prompt = `You are helping edit web project files. Here are the current files:

--- index.html ---
${htmlContent || '(empty)'}

--- styles.css ---
${cssContent || '(empty)'}

--- script.js ---
${jsContent || '(empty)'}

---

User request: ${message}

Respond with ONLY a JSON object in this exact format (no markdown, no explanation, just raw JSON):
{
  "html": "<full updated HTML content, or null if unchanged>",
  "css": "<full updated CSS content, or null if unchanged>",
  "js": "<full updated JS content, or null if unchanged>",
  "summary": "<brief plain-text summary of what you changed>"
}`

    try { await navigator.clipboard.writeText(prompt) } catch { /* clipboard may be blocked */ }
    window.open('https://claude.ai', '_blank')
    setShowOverlay(true)
  }

  // ── Claude paste response ─────────────────────────────────────────────────

  async function handlePasteResponse() {
    setPastingResponse(true)
    setPasteWarning(null)
    try {
      const text = await navigator.clipboard.readText()
      let parsed = null
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]) } catch { parsed = null }
      }

      if (!parsed || typeof parsed !== 'object') {
        if (selectedFile && viewRef.current) {
          viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: text } })
          setCurrentContent(text)
        }
        setPasteWarning('Could not parse JSON — applied plain text to current file only.')
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Response applied as plain text to current file (JSON parse failed).', warning: true }])
        setShowOverlay(false)
        setPastingResponse(false)
        return
      }

      const projectId = selectedFile?.projectId ?? null
      const fileMap = {
        html: agentOutputs.find(o => o.project_id === projectId && o.agent_name === 'Developer-HTML'),
        css:  agentOutputs.find(o => o.project_id === projectId && o.agent_name === 'Developer-CSS'),
        js:   agentOutputs.find(o => o.project_id === projectId && o.agent_name === 'Developer-JS'),
      }

      const changed = []
      for (const [key, newContent] of Object.entries({ html: parsed.html, css: parsed.css, js: parsed.js })) {
        if (!newContent || !fileMap[key]) continue
        const rec = fileMap[key]
        const currentText = rec.output_text ?? ''
        if (newContent.trim() === currentText.trim()) continue

        await supabase.from('agent_output_revisions').insert({
          project_id: projectId,
          agent_name: rec.agent_name,
          output_text: currentText,
          original_id: rec.id,
        }).then(({ error }) => {
          if (error) console.warn('[Editor] Revision save failed:', error.message)
        })

        await safeUpdate('agent_outputs', rec.id, { output_text: newContent })
        setAgentOutputs(prev => prev.map(o => o.id === rec.id ? { ...o, output_text: newContent } : o))
        changed.push(key === 'html' ? 'index.html' : key === 'css' ? 'styles.css' : 'script.js')

        if (selectedFileRef.current?.agentName === rec.agent_name) {
          setSavedContent(newContent)
          if (viewRef.current) {
            viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: newContent } })
            setCurrentContent(newContent)
          }
          setSelectedFile(prev => ({ ...prev, content: newContent }))
        }
      }

      const summary = parsed.summary ?? (changed.length > 0 ? `Updated: ${changed.join(', ')}` : 'No files changed.')
      setChatMessages(prev => [...prev, { role: 'assistant', content: summary, files: changed }])
      setShowOverlay(false)
    } catch (err) {
      setPasteWarning(`Failed to read clipboard: ${err.message}`)
    }
    setPastingResponse(false)
  }

  // ── Expand tree to a project ─────────────────────────────────────────────
  // Opens the client row and project row containing projectId so a newly
  // selected file is visible in the file browser.

  function expandToProject(projectId) {
    const proj = projects.find(p => p.id === projectId)
    if (!proj) return
    setOpenClients(prev => ({ ...prev, [proj.client_id]: true }))
    setOpenProjects(prev => ({ ...prev, [projectId]: true }))
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const unsaved    = currentContent !== savedContent
  const fileSizeKb = ((currentContent?.length ?? 0) / 1024).toFixed(1)
  const activeExt  = selectedFile?.ext ?? selectedFile?.file_type ?? ''

  // ── Folder tree renderer ─────────────────────────────────────────────────

  function renderFolder(folder, projectId, depth = 0) {
    if (depth > 3) return null
    if (q && !folderMatchesSearch(folder)) return null

    const isOpen = openFolders[folder.id] === true
    const childFolders = editorFolders.filter(f => f.parent_folder_id === folder.id)
    const childFiles   = editorFiles.filter(f => f.folder_id === folder.id)
    const indent = 32 + depth * 12

    const isRenaming = renameTarget?.id === folder.id && renameTarget?.type === 'folder'
    const isDragTarget = dragOverFolderId === folder.id

    return (
      <div key={folder.id}>
        <div
          className={`w-full flex items-center gap-1.5 py-1 pr-3 text-left hover:bg-white/5 transition-colors group cursor-pointer ${isDragTarget ? 'bg-violet-600/20' : ''}`}
          style={{ paddingLeft: indent }}
          onClick={() => setOpenFolders(p => ({ ...p, [folder.id]: !isOpen }))}
          onContextMenu={e => {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY, item: { id: folder.id, name: folder.name, type: 'folder', projectId, source: 'editor_folder' } })
          }}
          onDragOver={e => { e.preventDefault(); setDragOverFolderId(folder.id) }}
          onDragLeave={() => setDragOverFolderId(null)}
          onDrop={e => {
            e.preventDefault()
            setDragOverFolderId(null)
            const data = e.dataTransfer.getData('application/forge-file')
            if (data) {
              const { fileId } = JSON.parse(data)
              moveFile(fileId, folder.id)
            } else if (e.dataTransfer.files.length) {
              handleFileUpload(Array.from(e.dataTransfer.files), projectId, folder.id)
            }
          }}
        >
          <ChevronIcon open={isOpen} />
          <FolderSmallIcon />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenameTarget(null); setRenameName('') } }}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-xs bg-zinc-800 text-zinc-200 px-1 rounded outline-none ring-1 ring-violet-500"
            />
          ) : (
            <span className="text-xs text-zinc-400 truncate flex-1">{folder.name}</span>
          )}
        </div>

        {isOpen && (
          <>
            {childFolders.map(child => renderFolder(child, projectId, depth + 1))}
            {newFolderTarget?.parentFolderId === folder.id && (
              <div className="flex items-center gap-1.5 py-1 pr-3" style={{ paddingLeft: indent + 12 }}>
                <FolderSmallIcon />
                <input
                  ref={newFolderInputRef}
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderTarget(null); setNewFolderName('') } }}
                  placeholder="folder name"
                  className="flex-1 text-xs bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded outline-none ring-1 ring-violet-500"
                />
              </div>
            )}
            {childFiles.filter(f => !q || matchesSearch(f.filename)).map(rec => renderEditorFile(rec, projectId, indent + 12))}
          </>
        )}
      </div>
    )
  }

  function renderEditorFile(rec, projectId, indentPx) {
    const fileExt  = rec.file_type ?? rec.filename.split('.').pop().toLowerCase()
    const isActive = selectedFile?.source === 'editor_file' && selectedFile?.id === rec.id
    const isRenaming = renameTarget?.id === rec.id && renameTarget?.type === 'file'

    return (
      <div
        key={rec.id}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/forge-file', JSON.stringify({ fileId: rec.id, projectId }))
        }}
        onContextMenu={e => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY, item: { id: rec.id, name: rec.filename, type: 'file', projectId, folderId: rec.folder_id, source: 'editor_file', ...rec } })
        }}
        onClick={() => {
          if (isRenaming) return
          setSelectedFile({
            source: 'editor_file',
            id: rec.id,
            filename: rec.filename,
            label: rec.filename,
            ext: fileExt,
            content: rec.content,
            projectId: rec.project_id,
            folderId: rec.folder_id,
          })
          expandToProject(rec.project_id)
        }}
        className={`w-full flex items-center gap-2 py-1 pr-3 text-left transition-colors cursor-pointer ${
          isActive
            ? 'bg-violet-600/25 text-violet-300'
            : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
        }`}
        style={{ paddingLeft: indentPx }}
      >
        <EditorFileIcon ext={fileExt} />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenameTarget(null); setRenameName('') } }}
            onClick={e => e.stopPropagation()}
            className="flex-1 text-xs bg-zinc-800 text-zinc-200 px-1 rounded outline-none ring-1 ring-violet-500"
          />
        ) : (
          <>
            <span className="text-xs truncate flex-1">{rec.filename}</span>
            {rec.file_size != null && (
              <span className="text-[10px] text-zinc-600 flex-shrink-0">({(rec.file_size / 1024).toFixed(1)}KB)</span>
            )}
          </>
        )}
        {isActive && unsaved && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex"
      style={{ margin: '-1.5rem', height: 'calc(100vh - 4rem)' }}
    >
      {/* ── File browser ── */}
      <aside
        className={`w-52 flex-shrink-0 flex flex-col border-r transition-colors ${isDragOverPanel ? 'ring-1 ring-violet-500/50' : ''}`}
        style={{ background: '#1c1c1e', borderColor: '#2a2a2e' }}
        onDragOver={handlePanelDragOver}
        onDragLeave={handlePanelDragLeave}
        onDrop={handlePanelDrop}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: '#2a2a2e' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Explorer</p>
            <div className="flex items-center gap-1">
              <button
                title="New Folder"
                onClick={() => {
                  const firstProject = projects[0]
                  if (!firstProject) return
                  setNewFolderTarget({ projectId: firstProject.id, parentFolderId: null })
                  setNewFolderName('')
                }}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <NewFolderIcon className="w-3.5 h-3.5" />
              </button>
              <button
                title="Upload Files"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <UploadIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files…"
              className="w-full text-xs bg-zinc-800/80 text-zinc-300 placeholder:text-zinc-600 pl-6 pr-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            if (!files.length) return
            const firstProject = projects[0]
            if (!firstProject) return
            handleFileUpload(files, firstProject.id, null)
            e.target.value = ''
          }}
        />

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 rounded bg-zinc-800 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : tree.length === 0 && editorFolders.length === 0 && editorFiles.length === 0 ? (
            <p className="px-4 py-4 text-xs text-zinc-600 leading-relaxed">
              No files yet. Upload files or approve a Developer output on a project.
            </p>
          ) : (
            tree.map(({ client, projects: clientProjects }) => {
              if (q && !clientProjects.some(({ project, agentFiles, projectFolders, projectRootFiles }) =>
                matchesSearch(client.name) ||
                matchesSearch(project.name) ||
                agentFiles.some(f => matchesSearch(f.label)) ||
                projectFolders.some(f => folderMatchesSearch(f)) ||
                projectRootFiles.some(f => matchesSearch(f.filename))
              )) return null

              return (
                <div key={client.id}>
                  {/* Client row */}
                  <button
                    onClick={() => setOpenClients(p => ({ ...p, [client.id]: !p[client.id] }))}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <ChevronIcon open={openClients[client.id] === true} />
                    <UsersSmallIcon />
                    <span className="text-xs font-medium text-zinc-300 truncate">{client.name}</span>
                  </button>

                  {openClients[client.id] === true && clientProjects.map(({ project, agentFiles, projectFolders, projectRootFiles }) => {
                    if (q && !matchesSearch(project.name) &&
                        !agentFiles.some(f => matchesSearch(f.label)) &&
                        !projectFolders.some(f => folderMatchesSearch(f)) &&
                        !projectRootFiles.some(f => matchesSearch(f.filename))) return null

                    return (
                      <div key={project.id}>
                        {/* Project row */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenProjects(p => ({ ...p, [project.id]: !p[project.id] }))}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpenProjects(p => ({ ...p, [project.id]: !p[project.id] })) }}
                          className="w-full flex items-center gap-1.5 pl-5 pr-3 py-1.5 text-left hover:bg-white/5 transition-colors cursor-pointer group"
                        >
                          <ChevronIcon open={openProjects[project.id] === true} />
                          <FolderSmallIcon />
                          <span className="text-xs text-zinc-400 truncate flex-1">{project.name}</span>
                          <button
                            title="New folder in project"
                            onClick={e => {
                              e.stopPropagation()
                              setNewFolderTarget({ projectId: project.id, parentFolderId: null })
                              setNewFolderName('')
                              setOpenProjects(p => ({ ...p, [project.id]: true }))
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-zinc-300 text-zinc-600 transition-colors"
                          >
                            <NewFolderIcon className="w-3 h-3" />
                          </button>
                        </div>

                        {openProjects[project.id] === true && (
                          <>
                            {/* Agent output files */}
                            {agentFiles.filter(f => !q || matchesSearch(f.label)).map(file => {
                              const isActive = selectedFile?.recordId === file.recordId
                              return (
                                <button
                                  key={file.recordId}
                                  onClick={() => {
                                    if (selectedFile?.recordId === file.recordId) return
                                    setSelectedFile(file)
                                    expandToProject(file.projectId)
                                  }}
                                  className={`w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-left transition-colors ${
                                    isActive
                                      ? 'bg-violet-600/25 text-violet-300'
                                      : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                                  }`}
                                >
                                  <ExtIcon ext={file.ext} />
                                  <span className="text-xs truncate">{file.label}</span>
                                  {isActive && unsaved && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                                </button>
                              )
                            })}

                            {/* Editor folders */}
                            {projectFolders.filter(f => !q || folderMatchesSearch(f)).map(folder => renderFolder(folder, project.id, 0))}

                            {/* Inline new-folder input at project root */}
                            {newFolderTarget?.projectId === project.id && newFolderTarget?.parentFolderId == null && (
                              <div className="flex items-center gap-1.5 py-1 pr-3 pl-9">
                                <FolderSmallIcon />
                                <input
                                  ref={newFolderInputRef}
                                  value={newFolderName}
                                  onChange={e => setNewFolderName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderTarget(null); setNewFolderName('') } }}
                                  placeholder="folder name"
                                  className="flex-1 text-xs bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded outline-none ring-1 ring-violet-500"
                                />
                              </div>
                            )}

                            {/* Editor files at project root */}
                            {projectRootFiles.filter(f => !q || matchesSearch(f.filename)).map(rec => renderEditorFile(rec, project.id, 36))}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-36 py-1 rounded-lg shadow-xl border"
          style={{ left: contextMenu.x, top: contextMenu.y, background: '#1c1c1e', borderColor: '#3a3a3e' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/10 transition-colors"
            onClick={() => {
              setRenameTarget({ id: contextMenu.item.id, name: contextMenu.item.name, type: contextMenu.item.type })
              setRenameName(contextMenu.item.name)
              setContextMenu(null)
            }}
          >
            Rename
          </button>
          {contextMenu.item.type === 'folder' && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/10 transition-colors"
              onClick={() => {
                setNewFolderTarget({ projectId: contextMenu.item.projectId, parentFolderId: contextMenu.item.id })
                setNewFolderName('')
                setOpenFolders(p => ({ ...p, [contextMenu.item.id]: true }))
                setContextMenu(null)
              }}
            >
              New Subfolder
            </button>
          )}
          {contextMenu.item.type === 'file' && (
            <>
              <div className="px-3 py-1 text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">Move to…</div>
              {editorFolders
                .filter(f => f.project_id === contextMenu.item.projectId && f.id !== contextMenu.item.folderId)
                .map(f => (
                  <button
                    key={f.id}
                    className="w-full px-3 py-1.5 pl-5 text-left text-xs text-zinc-400 hover:bg-white/10 transition-colors"
                    onClick={() => moveFile(contextMenu.item.id, f.id)}
                  >
                    {f.name}
                  </button>
                ))
              }
              {contextMenu.item.folderId && (
                <button
                  className="w-full px-3 py-1.5 pl-5 text-left text-xs text-zinc-400 hover:bg-white/10 transition-colors"
                  onClick={() => moveFile(contextMenu.item.id, null)}
                >
                  (project root)
                </button>
              )}
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/10 transition-colors"
                onClick={() => duplicateFile(contextMenu.item)}
              >
                Duplicate
              </button>
            </>
          )}
          <div className="my-1 border-t" style={{ borderColor: '#3a3a3e' }} />
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-900/20 transition-colors"
            onClick={() => deleteItem(contextMenu.item)}
          >
            Delete
          </button>
        </div>
      )}

      {/* ── Editor panel ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${isDark ? 'bg-zinc-950' : 'bg-white'}`}>
        {selectedFile ? (
          <>
            {/* Toolbar */}
            <div className={`flex items-center gap-2 px-4 py-2 border-b flex-shrink-0 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-50 border-gray-200'}`}>
              {/* File breadcrumb */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                <EditorFileIcon ext={activeExt} />
                {selectedFile.clientName && (
                  <span className={`text-xs truncate ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                    {selectedFile.clientName} /&nbsp;
                  </span>
                )}
                {selectedFile.projectName && (
                  <>
                    <span className={`text-xs truncate ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                      {selectedFile.projectName}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>/</span>
                  </>
                )}
                <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {selectedFile.label ?? selectedFile.filename}
                </span>
                {unsaved && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 ml-1" title="Unsaved changes" />}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <ToolbarBtn
                  onClick={handleSave}
                  disabled={saving}
                  variant={unsaved ? 'primary' : 'default'}
                  isDark={isDark}
                  title="Save (Ctrl+S)"
                >
                  {saving ? 'Saving…' : 'Save'}
                </ToolbarBtn>
                <ToolbarBtn onClick={handleCopy} isDark={isDark} title="Copy all">
                  {copied ? 'Copied!' : 'Copy'}
                </ToolbarBtn>
                <ToolbarBtn onClick={handleFormat} disabled={formatting} isDark={isDark} title="Format code">
                  {formatting ? 'Formatting…' : 'Format'}
                </ToolbarBtn>
                <ToolbarBtn onClick={handlePreview} isDark={isDark} title="Preview in browser">
                  Preview
                </ToolbarBtn>
                <ToolbarBtn
                  onClick={() => setWordWrap(w => !w)}
                  variant={wordWrap ? 'active' : 'default'}
                  isDark={isDark}
                  title="Toggle word wrap"
                >
                  Wrap
                </ToolbarBtn>
                <ToolbarBtn onClick={() => setIsDark(d => !d)} isDark={isDark} title="Toggle theme">
                  {isDark ? '☀' : '☾'}
                </ToolbarBtn>
                {selectedFile?.clientName && selectedFile?.projectName && (
                  <ToolbarBtn
                    onClick={() => openProjectFolder(selectedFile.clientName, selectedFile.projectName, showToast)}
                    isDark={isDark}
                    title="Open project folder in Explorer"
                  >
                    Open Folder
                  </ToolbarBtn>
                )}
              </div>
            </div>

            {/* Format error bar */}
            {formatError && (
              <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-red-400">Format error: {formatError}</span>
                <button onClick={() => setFormatError(null)} className="text-xs text-red-500 hover:text-red-300">✕</button>
              </div>
            )}

            {/* CodeMirror mount */}
            <div
              ref={editorDomRef}
              className="flex-1 overflow-hidden"
            />

            {/* Status bar */}
            <div className={`flex items-center gap-5 px-4 py-1 border-t text-xs select-none flex-shrink-0 ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
              <span>Ln {cursorLine}, Col {cursorCol}</span>
              <span>{totalLines} {totalLines === 1 ? 'line' : 'lines'}</span>
              <span>{fileSizeKb} KB</span>
              <span>{activeExt.toUpperCase()}</span>
              {unsaved ? (
                <span className="flex items-center gap-1.5 text-amber-400 ml-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Unsaved changes
                </span>
              ) : (
                <span className={`ml-auto ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`}>Saved</span>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${isDark ? 'bg-zinc-900 border border-zinc-800' : 'bg-gray-100'}`}>
              <CodeBracketIcon className={`w-8 h-8 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`} />
            </div>
            <div className="text-center space-y-1">
              <p className={`text-sm font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>No file open</p>
              <p className={`text-xs ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Select a file from the explorer to start editing</p>
            </div>
            <button
              onClick={() => setIsDark(d => !d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-gray-200 text-gray-500 hover:text-gray-700'}`}
            >
              Switch to {isDark ? 'light' : 'dark'} theme
            </button>
          </div>
        )}
      </div>

      {/* ── Claude panel ── */}
      <div
        className="w-72 flex-shrink-0 flex flex-col border-l relative"
        style={{ background: '#1c1c1e', borderColor: '#2a2a2e' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: '#2a2a2e' }}>
          <div className="flex items-center gap-2">
            <ClaudeIcon className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-zinc-300">Claude Assistant</span>
          </div>
          <button
            onClick={() => { setChatMessages([]); setPasteWarning(null); setShowOverlay(false) }}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Clear chat"
          >
            Clear
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {chatMessages.length === 0 && (
            <p className="text-xs text-zinc-600 text-center mt-6 leading-relaxed px-2">
              Ask Claude to fix bugs, improve code, or make changes to your project files.
            </p>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-3 py-2 rounded-lg text-xs leading-relaxed max-w-full break-words ${
                msg.role === 'user'
                  ? 'bg-violet-600/30 text-violet-200 rounded-br-sm'
                  : msg.warning
                    ? 'bg-amber-900/30 text-amber-300 border border-amber-800/50 rounded-bl-sm'
                    : 'bg-zinc-800 text-zinc-300 rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.files?.length > 0 && (
                <div className="flex flex-wrap gap-1 px-1">
                  {msg.files.map(f => (
                    <span key={f} className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{f}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Overlay */}
        {showOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 gap-4 z-10" style={{ background: 'rgba(9,9,11,0.96)' }}>
            <ClaudeIcon className="w-10 h-10 text-violet-400" />
            <p className="text-sm font-semibold text-white text-center">Prompt copied!</p>
            <ol className="text-xs text-zinc-400 space-y-2 w-full">
              <li className="flex gap-2"><span className="text-violet-500 font-bold">1.</span> Claude.ai opened in a new tab</li>
              <li className="flex gap-2"><span className="text-violet-500 font-bold">2.</span> Start a new chat</li>
              <li className="flex gap-2"><span className="text-violet-500 font-bold">3.</span> Paste the prompt (Ctrl+V)</li>
              <li className="flex gap-2"><span className="text-violet-500 font-bold">4.</span> Copy Claude's full JSON response</li>
            </ol>
            <button
              onClick={handlePasteResponse}
              disabled={pastingResponse}
              className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {pastingResponse ? 'Applying…' : 'Paste Response'}
            </button>
            {pasteWarning && (
              <p className="text-xs text-amber-400 text-center">{pasteWarning}</p>
            )}
            <button
              onClick={() => setShowOverlay(false)}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Quick actions */}
        <div className="px-3 pt-2 pb-1 border-t flex flex-wrap gap-1.5" style={{ borderColor: '#2a2a2e' }}>
          {['Fix Bugs', 'Improve Performance', 'Add Comments'].map(action => (
            <button
              key={action}
              onClick={() => setChatInput(action)}
              className="px-2 py-1 rounded text-[10px] text-zinc-500 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
            >
              {action}
            </button>
          ))}
        </div>

        {pasteWarning && !showOverlay && (
          <div className="px-3 py-2 border-t" style={{ borderColor: '#2a2a2e', background: 'rgba(120,53,15,0.2)' }}>
            <p className="text-xs text-amber-400">{pasteWarning}</p>
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t flex-shrink-0" style={{ borderColor: '#2a2a2e' }}>
          <div className="flex gap-2 items-end">
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask Claude… (Enter to send)"
              rows={2}
              className="flex-1 resize-none rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ background: '#2a2a2e', border: '1px solid #3a3a3e' }}
            />
            <button
              onClick={handleSend}
              disabled={!chatInput.trim()}
              className="px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Toolbar button ─────────────────────────────────────────────────────────────

function ToolbarBtn({ children, onClick, disabled, variant = 'default', isDark, title }) {
  const base = 'px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = variant === 'primary'
    ? 'bg-violet-600 text-white hover:bg-violet-500'
    : variant === 'active'
      ? isDark ? 'bg-violet-600/20 text-violet-300 hover:bg-violet-600/30' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
      : isDark
        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
        : 'bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-900'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`} title={title}>
      {children}
    </button>
  )
}

// ── File tree icons ────────────────────────────────────────────────────────────

function ChevronIcon({ open }) {
  return (
    <svg
      className="w-3 h-3 text-zinc-600 flex-shrink-0 transition-transform"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function UsersSmallIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function FolderSmallIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-amber-500/70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

const EXT_COLORS = { html: 'text-orange-400', css: 'text-blue-400', js: 'text-amber-400', jsx: 'text-amber-400', ts: 'text-amber-400', tsx: 'text-amber-400' }

function ExtIcon({ ext }) {
  const color = EXT_COLORS[ext] ?? 'text-zinc-400'
  return (
    <span className={`text-[9px] font-bold uppercase flex-shrink-0 w-5 text-center ${color}`}>
      {ext}
    </span>
  )
}

function EditorFileIcon({ ext }) {
  const IMAGE_EXTS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico']
  if (ext === 'html') return <span className="text-[9px] font-bold uppercase flex-shrink-0 w-5 text-center text-orange-400">html</span>
  if (ext === 'css')  return <span className="text-[9px] font-bold uppercase flex-shrink-0 w-5 text-center text-blue-400">css</span>
  if (['js','jsx','ts','tsx'].includes(ext)) return <span className="text-[9px] font-bold uppercase flex-shrink-0 w-5 text-center text-amber-400">{ext}</span>
  if (['json','xml'].includes(ext)) return <span className="text-[9px] font-bold uppercase flex-shrink-0 w-5 text-center text-zinc-400">{ext}</span>
  if (IMAGE_EXTS.includes(ext)) return <ImageFileIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
  if (ext === 'pdf') return <PdfFileIcon className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
  return <GenericFileIcon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
}

function CodeBracketIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  )
}

function ClaudeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}

function UploadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M12 12V4m0 0-3 3m3-3 3 3" />
    </svg>
  )
}

function NewFolderIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" strokeLinecap="round" />
      <line x1="9" y1="14" x2="15" y2="14" strokeLinecap="round" />
    </svg>
  )
}

function ImageFileIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
    </svg>
  )
}

function PdfFileIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="9" y1="13" x2="15" y2="13" strokeLinecap="round" />
      <line x1="9" y1="17" x2="15" y2="17" strokeLinecap="round" />
    </svg>
  )
}

function GenericFileIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
    </svg>
  )
}
