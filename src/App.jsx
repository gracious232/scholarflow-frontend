import React, { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DEFAULT_API_BASE =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://scholarflow-backend.fly.dev'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '')

export default function App() {
  const [auth, setAuth] = useState(null)
  const [page, setPage] = useState('auth')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('papersetToken')
    if (token) {
      setAuth({ token })
      setPage('dashboard')
    }
  }, [])

  async function handleAuth(email, password, isRegister) {
    setLoading(true)
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: email.split('@')[0] })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      localStorage.setItem('papersetToken', data.token)
      setAuth(data)
      setPage('dashboard')
    } catch (err) {
      alert('Auth failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('papersetToken')
    setAuth(null)
    setPage('auth')
  }

  if (page === 'auth' && !auth) {
    return <AuthPage onAuth={handleAuth} loading={loading} />
  }

  if (page === 'dashboard' && auth) {
    return <DashboardPage auth={auth} onLogout={logout} onFormatter={() => setPage('formatter')} />
  }

  if (page === 'formatter' && auth) {
    return <FormatterPage auth={auth} onBack={() => setPage('dashboard')} />
  }

  return <AuthPage onAuth={handleAuth} loading={loading} />
}

function AuthPage({ onAuth, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)

  return (
    <div className="container auth-container">
      <header>
        <div className="logo-title-group">
          <img src="/logo.svg" alt="Paperset Logo" className="header-logo" />
          <div>
            <h1>PaperSet</h1>
            <p className="tagline">Academic writing workflow and formatting platform</p>
          </div>
        </div>
      </header>

      <div className="auth-box">
        <h2>{isRegister ? 'Create Account' : 'Login'}</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="auth-input"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="auth-input"
        />
        <button
          onClick={() => onAuth(email, password, isRegister)}
          disabled={loading || !email || !password}
          className="btn btn-primary"
        >
          {loading ? 'Loading...' : isRegister ? 'Register' : 'Login'}
        </button>
        <p>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <button onClick={() => setIsRegister(!isRegister)} className="btn-link">
            {isRegister ? ' Login' : ' Register'}
          </button>
        </p>
      </div>
    </div>
  )
}

function DashboardPage({ auth, onLogout, onFormatter }) {
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingPaperId, setDownloadingPaperId] = useState(null)
  const [showOldProjects, setShowOldProjects] = useState(false)
  const [latestScore, setLatestScore] = useState(null)
  const [latestScoreMeta, setLatestScoreMeta] = useState(null)

  useEffect(() => {
    fetchPapers()
    fetchLatestScore()
  }, [])

  async function fetchPapers() {
    try {
      const res = await fetch(`${API_BASE}/api/papers`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      })
      const data = await res.json()
      setPapers(data || [])
    } catch (err) {
      console.error('Failed to fetch papers:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLatestScore() {
    try {
      const res = await fetch(`${API_BASE}/api/drafts/latest-score`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch score')

      setLatestScore(data.draft_score)
      setLatestScoreMeta(data)
    } catch (err) {
      console.error('Failed to fetch latest writing score:', err)
      setLatestScore(null)
      setLatestScoreMeta(null)
    }
  }

  function getFallbackFormattingSettings() {
    return {
      style: 'APA 7',
      font: 'Times New Roman',
      font_size: 12,
      line_spacing: 'Double',
      margins: '1 inch',
      page_numbers: 'Top Right',
      reference_title: 'References'
    }
  }

  function downloadBlobFile(blob, fileName) {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    window.URL.revokeObjectURL(url)
  }

  function buildFallbackHtml(paper) {
    const safeText = (paper?.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    return `<!doctype html><html><head><meta charset="utf-8"><title>${paper?.title || 'Paper'}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:2;margin:1in;white-space:pre-wrap;}</style></head><body>${safeText}</body></html>`
  }

  async function fetchPaperDetails(paperId) {
    const res = await fetch(`${API_BASE}/api/papers/${paperId}`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch paper details')
    return data
  }

  async function downloadOldPaperDocx(paperId) {
    setDownloadingPaperId(paperId)
    try {
      const paper = await fetchPaperDetails(paperId)
      const res = await fetch(`${API_BASE}/api/export/docx-formatted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formatted_text: paper.content || '',
          paper_title: paper.title || 'paper',
          formatting_settings: getFallbackFormattingSettings(),
          citations: paper.citations || []
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'DOCX export failed')
      }

      const blob = await res.blob()
      downloadBlobFile(blob, `${paper.title || 'paper'}.docx`)
    } catch (err) {
      alert('Download failed: ' + err.message)
    } finally {
      setDownloadingPaperId(null)
    }
  }

  async function downloadOldPaperPdf(paperId) {
    setDownloadingPaperId(paperId)
    try {
      const paper = await fetchPaperDetails(paperId)
      const res = await fetch(`${API_BASE}/api/export/pdf-formatted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: paper.html || buildFallbackHtml(paper),
          formatting_settings: getFallbackFormattingSettings()
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'PDF export failed')
      }

      const blob = await res.blob()
      downloadBlobFile(blob, `${paper.title || 'paper'}.pdf`)
    } catch (err) {
      alert('Download failed: ' + err.message)
    } finally {
      setDownloadingPaperId(null)
    }
  }

  return (
    <div className="container">
      <header>
        <div className="header-top">
          <div className="logo-title-group">
            <img src="/logo.svg" alt="Paperset Logo" className="header-logo" />
            <h1>PaperSet</h1>
          </div>
          <button onClick={onLogout} className="btn btn-logout">Logout</button>
        </div>
      </header>

      <div className="main-content">
        <div className="dashboard">
          <section className="dashboard-score-card">
            <div className="dashboard-score-left">
              <h2>Writing Score</h2>
              <p className="hint">
                {latestScoreMeta?.paper_title
                  ? `Latest: ${latestScoreMeta.paper_title}`
                  : 'No draft scored yet. Start writing to generate your first score.'}
              </p>
            </div>
            <div className="dashboard-score-value">
              {latestScore ?? '--'}
            </div>
          </section>

          <div className="dashboard-layout">
            <section className="dashboard-actions-panel">
              <h2>Start New Project</h2>
              <p className="hint">Assignment | Professor Mode | Writing | Live checks | Draft History</p>
              <div className="dashboard-action-buttons">
                <button onClick={onFormatter} className="btn btn-primary btn-lg">Start Writing Assignment</button>
                <button onClick={() => setShowOldProjects((prev) => !prev)} className="btn btn-secondary btn-lg">
                  {showOldProjects ? 'Hide Old Projects' : 'Old Projects'}
                </button>
              </div>
            </section>

            {showOldProjects && (
              <section className="project-library-panel">
                <div className="project-library-header">
                  <h2>Old Projects</h2>
                  <span className="project-count">{papers.length}</span>
                </div>

                {loading ? (
                  <p className="library-message">Loading your projects...</p>
                ) : papers.length === 0 ? (
                  <p className="library-message">No saved projects yet.</p>
                ) : (
                  <div className="papers-list">
                    {papers.map((paper) => (
                      <div key={paper.id} className="paper-card">
                        <h3>{paper.title}</h3>
                        <p className="date">{new Date(paper.created_at).toLocaleDateString()}</p>
                        <div className="paper-card-actions">
                          <button
                            onClick={() => downloadOldPaperDocx(paper.id)}
                            className="btn btn-small"
                            disabled={downloadingPaperId === paper.id}
                          >
                            {downloadingPaperId === paper.id ? 'Preparing...' : 'Download DOCX'}
                          </button>
                          <button
                            onClick={() => downloadOldPaperPdf(paper.id)}
                            className="btn btn-small"
                            disabled={downloadingPaperId === paper.id}
                          >
                            {downloadingPaperId === paper.id ? 'Preparing...' : 'Download PDF'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FormatterPage({ auth, onBack }) {
  const [formattingSettings, setFormattingSettings] = useState({
    style: 'APA 7',
    font: 'Times New Roman',
    font_size: 12,
    line_spacing: 'Double',
    margins: '1 inch',
    page_numbers: 'Top Right',
    running_head: false,
    title_page: true,
    reference_title: 'References',
    simplify_language: false,
    humanize_language: false
  })

  const [paperInfo, setPaperInfo] = useState({
    paper_title: '',
    author_name: '',
    institution: '',
    professor_name: '',
    course_name: '',
    due_date: ''
  })

  const [paperContent, setPaperContent] = useState('')
  const [formattedResult, setFormattedResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [formatOptions, setFormatOptions] = useState(null)
  const [autosaveMessage, setAutosaveMessage] = useState('')

  const [professorMode, setProfessorMode] = useState({
    enabled: true,
    assignment_name: '',
    template_text: '',
    rubric_text: '',
    required_sections_text: 'Introduction, Main Body, Conclusion',
    min_word_count: 800,
    max_word_count: 1500,
    citation_style: 'APA 7',
    font: 'Times New Roman',
    line_spacing: 'Double',
    margins: '1 inch',
    title_page: true
  })

  const [professorCheck, setProfessorCheck] = useState(null)
  const [checkingProfessorMode, setCheckingProfessorMode] = useState(false)
  const [draftHistory, setDraftHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeStep, setActiveStep] = useState('workflow')
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0)
  const [assignmentChecklist, setAssignmentChecklist] = useState([])
  const [detectedInstructionSections, setDetectedInstructionSections] = useState([])
  const [isAutosaving, setIsAutosaving] = useState(false)
  const [isChecklistDragging, setIsChecklistDragging] = useState(false)
  const [autosaveEnabled, setAutosaveEnabled] = useState(true)

  const autosaveHashRef = useRef('')

  useEffect(() => {
    fetch(`${API_BASE}/api/formatting-styles`)
      .then((r) => r.json())
      .then((data) => {
        setFormatOptions(data)
        setProfessorMode((prev) => ({ ...prev, citation_style: data.styles?.[0] || prev.citation_style }))
      })
      .catch((err) => console.error('Failed to fetch formatting options:', err))

    fetchTemplates()
  }, [])

  useEffect(() => {
    setProfessorMode((prev) => ({
      ...prev,
      assignment_name: paperInfo.paper_title,
      citation_style: formattingSettings.style,
      font: formattingSettings.font,
      line_spacing: formattingSettings.line_spacing,
      margins: formattingSettings.margins,
      title_page: formattingSettings.title_page
    }))
  }, [paperInfo.paper_title, formattingSettings])

  useEffect(() => {
    if (!professorMode.enabled || !paperContent.trim() || !paperInfo.paper_title.trim()) return

    const timer = setTimeout(() => {
      runProfessorCheck()
    }, 1200)

    return () => clearTimeout(timer)
  }, [paperContent, paperInfo.paper_title, professorMode.required_sections_text, professorMode.min_word_count, professorMode.max_word_count, professorMode.rubric_text, professorMode.template_text, formattingSettings])

  useEffect(() => {
    if (!paperInfo.paper_title.trim()) return

    fetchDraftHistory(paperInfo.paper_title)
  }, [paperInfo.paper_title])

  useEffect(() => {
    if (!autosaveEnabled || !paperInfo.paper_title.trim() || !paperContent.trim()) return

    const interval = setInterval(() => {
      autosaveDraft(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [autosaveEnabled, paperContent, paperInfo.paper_title, formattingSettings, professorMode])

  const badges = useMemo(() => {
    if (!draftHistory?.improvement) return []
    const list = []
    const improvement = draftHistory.improvement

    if (improvement.clarity_gain >= 8) list.push('Clarity Climber')
    if (improvement.grammar_reduction >= 5) list.push('Grammar Guardian')
    if (improvement.word_growth >= 250) list.push('Deep Researcher')
    if ((draftHistory.total_drafts || 0) >= 5) list.push('Consistency Streak')

    return list
  }, [draftHistory])

  const latestScore = draftHistory?.latest_metrics?.draft_score ?? draftHistory?.latest_metrics?.clarity_score ?? 0
  const latestDrafts = draftHistory?.total_drafts ?? 0
  const latestGrammar = draftHistory?.latest_metrics?.grammar_issues ?? 0
  const latestSpelling = draftHistory?.latest_metrics?.spelling_issues ?? 0
  const latestBreakdown = draftHistory?.latest_metrics?.score_breakdown || null

  const breakdownRows = [
    {
      label: 'Content and Ideas',
      value: latestBreakdown?.content_ideas?.score ?? null,
      outOf: latestBreakdown?.content_ideas?.out_of ?? 25
    },
    {
      label: 'Organization',
      value: latestBreakdown?.organization_structure?.score ?? null,
      outOf: latestBreakdown?.organization_structure?.out_of ?? 25
    },
    {
      label: 'Grammar and Mechanics',
      value: latestBreakdown?.grammar_mechanics?.score ?? null,
      outOf: latestBreakdown?.grammar_mechanics?.out_of ?? 25
    },
    {
      label: 'Formatting and References',
      value: latestBreakdown?.formatting_references?.score ?? null,
      outOf: latestBreakdown?.formatting_references?.out_of ?? 25
    }
  ]

  function getScoreStatus(score) {
    if (score >= 80) return 'good'
    if (score >= 55) return 'warn'
    return 'bad'
  }

  function getIssueStatus(count) {
    if (count <= 2) return 'good'
    if (count <= 6) return 'warn'
    return 'bad'
  }

  async function fetchTemplates() {
    try {
      const res = await fetch(`${API_BASE}/api/templates/my-templates`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      })
      const data = await res.json()
      setTemplates(data || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
  }

  async function handlePaperFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/papers/upload`, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setPaperContent(data.content)
      alert(`Extracted ${file.name} successfully.`)
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRubricUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/professor-mode/upload-rubric`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      applyExtractedRequirements(data.extracted_requirements, data.checklist)
      setDetectedInstructionSections(data.detected_sections || [])
      setProfessorMode((prev) => ({ ...prev, rubric_text: data.rubric_text }))
      alert(`Rubric loaded from ${data.file_name}.`)
    } catch (err) {
      alert('Rubric upload failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function applyExtractedRequirements(extracted, checklist) {
    if (!extracted) return

    setProfessorMode((prev) => ({
      ...prev,
      min_word_count: extracted.word_count?.min ?? prev.min_word_count,
      max_word_count: extracted.word_count?.max ?? prev.max_word_count,
      required_sections_text: (extracted.required_sections || []).length > 0
        ? extracted.required_sections.join(', ')
        : prev.required_sections_text,
      citation_style: extracted.citation?.styles?.[0] || prev.citation_style,
      font: extracted.formatting?.font || prev.font,
      line_spacing: extracted.formatting?.line_spacing || prev.line_spacing,
      margins: extracted.formatting?.margins || prev.margins
    }))

    setAssignmentChecklist((checklist || []).map((item) => ({ ...item, done: false })))
  }

  async function processAssignmentDocumentFile(file) {
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/professor-mode/extract-checklist`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
        body: formData
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      applyExtractedRequirements(data.extracted_requirements, data.checklist)
      setDetectedInstructionSections(data.detected_sections || [])
      setProfessorMode((prev) => ({
        ...prev,
        template_text: Object.values(data.sections || {}).join('\n\n') || prev.template_text
      }))
      alert('Assignment requirements extracted and checklist generated.')
    } catch (err) {
      alert('Assignment extraction failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignmentDocumentUpload(e) {
    const file = e.target.files[0]
    await processAssignmentDocumentFile(file)
  }

  async function handleChecklistDrop(e) {
    e.preventDefault()
    setIsChecklistDragging(false)
    const file = e.dataTransfer?.files?.[0]
    await processAssignmentDocumentFile(file)
  }

  function isChecklistItemSatisfied(item) {
    if (!professorCheck) return item.done
    const deviations = professorCheck.deviations || []
    if (item.id === 'word_count') return !deviations.some((d) => d.requirement === 'word_count')
    if (item.id === 'required_sections') return !deviations.some((d) => d.requirement === 'required_sections')
    if (item.id === 'citation_style') return !deviations.some((d) => d.requirement === 'citation_style')
    if (item.id === 'formatting') {
      return !deviations.some((d) => ['font', 'line_spacing', 'margins', 'title_page'].includes(d.requirement))
    }
    return item.done
  }

  async function runProfessorCheck() {
    if (!professorMode.enabled) return
    setCheckingProfessorMode(true)

    try {
      const res = await fetch(`${API_BASE}/api/professor-mode/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          paper_content: paperContent,
          paper_info: paperInfo,
          formatting_settings: formattingSettings,
          professor_mode: {
            ...professorMode,
            required_sections: professorMode.required_sections_text
          }
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Professor check failed')
      setProfessorCheck(data)
    } catch (err) {
      console.error(err)
    } finally {
      setCheckingProfessorMode(false)
    }
  }

  async function autosaveDraft(showToast = true) {
    const currentHash = JSON.stringify({
      title: paperInfo.paper_title,
      content: paperContent,
      style: formattingSettings,
      professorMode
    })

    if (currentHash === autosaveHashRef.current) return

    setIsAutosaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/drafts/autosave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          assignment_name: paperInfo.paper_title,
          paper_title: paperInfo.paper_title || 'Untitled Draft',
          paper_content: paperContent,
          formatting_settings: formattingSettings,
          professor_mode: {
            ...professorMode,
            required_sections: professorMode.required_sections_text
          },
          citations: formattedResult?.citations || []
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      autosaveHashRef.current = currentHash
      const msg = `Autosaved at ${new Date(data.saved_at).toLocaleTimeString()}`
      setAutosaveMessage(msg)
      if (showToast) alert(msg)
      fetchDraftHistory(paperInfo.paper_title)
    } catch (err) {
      setAutosaveMessage('Autosave failed: ' + err.message)
    } finally {
      setIsAutosaving(false)
    }
  }

  async function fetchDraftHistory(selectedAssignment) {
    if (!selectedAssignment) return

    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/drafts/history?assignment_name=${encodeURIComponent(selectedAssignment)}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDraftHistory(data)
    } catch (err) {
      setDraftHistory(null)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleTransformPaper() {
    if (!paperInfo.paper_title.trim()) {
      alert('Please enter paper title first.')
      return
    }
    if (!paperContent.trim()) {
      alert('Please paste paper content or upload a file.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/papers/transform-with-formatting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          paper_content: paperContent,
          paper_info: paperInfo,
          formatting_settings: formattingSettings
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setFormattedResult(data)
      setMaxUnlockedStep(steps.length - 1)
      setActiveStep('output')
      await autosaveDraft(false)
      if (professorMode.enabled) {
        await runProfessorCheck()
      }
    } catch (err) {
      alert('Transform failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function exportDocx() {
    if (!formattedResult) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/export/docx-formatted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formatted_text: formattedResult.formatted,
          paper_title: paperInfo.paper_title || 'formatted-paper',
          formatting_settings: formattingSettings,
          citations: formattedResult.citations
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Export failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${paperInfo.paper_title || 'paper'}.docx`
      a.click()
      window.URL.revokeObjectURL(url)
      alert('Document downloaded successfully.')
    } catch (err) {
      alert('Export failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function exportPdf() {
    if (!formattedResult) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/export/pdf-formatted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: formattedResult.html,
          formatting_settings: formattingSettings
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Export failed')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${paperInfo.paper_title || 'paper'}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
      alert('Document downloaded successfully.')
    } catch (err) {
      alert('Export failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function copyFormattedText() {
    if (!formattedResult) return
    navigator.clipboard.writeText(formattedResult.formatted)
    alert('Formatted text copied to clipboard.')
  }

  async function saveTemplate() {
    const templateName = prompt('Enter template name:')
    if (!templateName) return

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/templates/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          template_name: templateName,
          ...formattingSettings,
          professor_name: paperInfo.professor_name,
          course_name: paperInfo.course_name
        })
      })
      if (!res.ok) throw new Error('Failed to save')
      alert('Template saved.')
      fetchTemplates()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function loadTemplate(template) {
    setFormattingSettings({
      style: template.style || 'APA 7',
      font: template.font || 'Times New Roman',
      font_size: template.font_size || 12,
      line_spacing: template.line_spacing || 'Double',
      margins: template.margins || '1 inch',
      page_numbers: template.page_numbers || 'Top Right',
      running_head: !!template.running_head,
      title_page: !!template.title_page,
      reference_title: template.reference_title || 'References',
      simplify_language: !!template.simplify_language,
      humanize_language: !!template.humanize_language
    })
    setPaperInfo((prev) => ({
      ...prev,
      professor_name: template.professor_name || '',
      course_name: template.course_name || ''
    }))
  }

  const steps = [
    { id: 'workflow', label: 'Assignment Setup', icon: 'AS' },
    { id: 'professor', label: 'Professor Mode', icon: 'PM' },
    { id: 'writing', label: 'Writing Draft', icon: 'WD' },
    { id: 'formatting', label: 'Formatting Rules', icon: 'FR' },
    { id: 'output', label: 'Final Output', icon: 'FO' }
  ]

  const currentStepIndex = steps.findIndex((step) => step.id === activeStep)

  function goToStep(stepId, idx) {
    if (idx <= maxUnlockedStep) {
      setActiveStep(stepId)
    }
  }

  function goPreviousStep() {
    if (currentStepIndex <= 0) return
    setActiveStep(steps[currentStepIndex - 1].id)
  }

  function goNextStep() {
    if (activeStep === 'workflow' && !paperInfo.paper_title.trim()) {
      alert('Please enter Paper Title to continue.')
      return
    }
    if (activeStep === 'writing' && !paperContent.trim()) {
      alert('Please add draft content before continuing.')
      return
    }

    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setMaxUnlockedStep((prev) => Math.max(prev, nextIndex))
      setActiveStep(steps[nextIndex].id)
    }
  }

  return (
    <div className="container">
      <header>
        <div className="header-top">
          <div className="logo-title-group">
            <img src="/logo.svg" alt="Paperset Logo" className="header-logo" />
            <h1>Academic Paper Formatter</h1>
          </div>
        </div>
      </header>

      <div className="formatter-container">
        <section className="workflow-stepper">
          <button onClick={onBack} className="step-pill step-back">
            <span className="nav-icon">BD</span>
            <span>Back to Dashboard</span>
          </button>
          {steps.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => goToStep(step.id, idx)}
              className={`step-pill ${activeStep === step.id ? 'is-active' : ''}`}
              disabled={idx > maxUnlockedStep}
            >
              <span className="nav-icon">{step.icon}</span>
              <span>{step.label}</span>
            </button>
          ))}
        </section>

        <section className="save-controls-bar">
          <div className="save-controls-left">
            <label className="autosave-toggle">
              <input
                type="checkbox"
                checked={autosaveEnabled}
                onChange={(e) => setAutosaveEnabled(e.target.checked)}
              />
              <span>Autosave every 30 seconds</span>
            </label>
            <span className="save-status-text">
              {isAutosaving ? 'Saving draft...' : (autosaveMessage || 'Ready to save')}
            </span>
          </div>
          <button
            onClick={() => autosaveDraft(true)}
            className="btn btn-secondary"
            disabled={!paperInfo.paper_title.trim() || !paperContent.trim() || isAutosaving}
          >
            {isAutosaving ? <span className="btn-spinner" /> : null}
            {isAutosaving ? 'Saving' : 'Save Draft Now'}
          </button>
        </section>

        <div className="workspace-main">
        {activeStep === 'workflow' && (
          <div className="assignment-setup-layout">
            <section className="formatter-section setup-block">
              <h2>Section 1: Assignment Details</h2>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Paper Title</label>
                  <input
                    type="text"
                    value={paperInfo.paper_title}
                    onChange={(e) => setPaperInfo({ ...paperInfo, paper_title: e.target.value })}
                    placeholder="Your paper title"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Your Name</label>
                  <input
                    type="text"
                    value={paperInfo.author_name}
                    onChange={(e) => setPaperInfo({ ...paperInfo, author_name: e.target.value })}
                    placeholder="John Doe"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Institution</label>
                  <input
                    type="text"
                    value={paperInfo.institution}
                    onChange={(e) => setPaperInfo({ ...paperInfo, institution: e.target.value })}
                    placeholder="University Name"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Professor Name</label>
                  <input
                    type="text"
                    value={paperInfo.professor_name}
                    onChange={(e) => setPaperInfo({ ...paperInfo, professor_name: e.target.value })}
                    placeholder="Prof. Smith"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Course Name</label>
                  <input
                    type="text"
                    value={paperInfo.course_name}
                    onChange={(e) => setPaperInfo({ ...paperInfo, course_name: e.target.value })}
                    placeholder="ENGL 101"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={paperInfo.due_date}
                    onChange={(e) => setPaperInfo({ ...paperInfo, due_date: e.target.value })}
                    className="form-input"
                  />
                </div>
              </div>

            </section>

            <section className="formatter-section setup-block checklist-panel">
              <h2>Section 2: Assignment Checklist</h2>
              {detectedInstructionSections.length > 0 && (
                <p className="hint">Detected sections: {detectedInstructionSections.join(', ')}</p>
              )}

              {assignmentChecklist.length === 0 ? (
                <p className="library-message">Checklist will appear after upload in Professor Mode.</p>
              ) : (
                <div className="checklist-items">
                  {assignmentChecklist.map((item) => {
                    const autoSatisfied = isChecklistItemSatisfied(item)
                    return (
                      <label key={item.id} className={`checklist-item ${autoSatisfied ? 'is-done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={item.done || autoSatisfied}
                          onChange={(e) => {
                            setAssignmentChecklist((prev) =>
                              prev.map((x) => (x.id === item.id ? { ...x, done: e.target.checked } : x))
                            )
                          }}
                        />
                        <span>{item.label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeStep === 'professor' && (
          <section className="formatter-section">
            <h2>Professor Mode</h2>
            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={professorMode.enabled}
                  onChange={(e) => setProfessorMode((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                Enable Professor Mode checks
              </label>
            </div>

            <div className="input-methods">
              <div className="method">
                <h3>Template or Rubric Input</h3>
                <div className="upload-stack">
                  <label className="compact-label">Upload Assignment Instructions / Rubric</label>
                  <input
                    type="file"
                    onChange={handleAssignmentDocumentUpload}
                    accept=".docx,.pdf,.txt"
                    className="form-input"
                  />
                  <p className="hint">Automatically detects instructions, requirements, rubric, and builds checklist.</p>
                </div>
                <textarea
                  value={professorMode.template_text}
                  onChange={(e) => setProfessorMode((prev) => ({ ...prev, template_text: e.target.value }))}
                  placeholder="Paste assignment instructions/template here"
                  rows={6}
                  className="form-textarea"
                />
                <textarea
                  value={professorMode.rubric_text}
                  onChange={(e) => setProfessorMode((prev) => ({ ...prev, rubric_text: e.target.value }))}
                  placeholder="Paste rubric text here (optional: include points per requirement)"
                  rows={6}
                  className="form-textarea"
                />
                <input type="file" onChange={handleRubricUpload} accept=".docx,.pdf,.txt" className="form-input" />
                <p className="hint">Upload professor rubric/template as Word, PDF, or TXT.</p>
              </div>
              <div className="method">
                <h3>Requirement Targets</h3>
                <div className="form-group">
                  <label>Required Sections</label>
                  <input
                    type="text"
                    value={professorMode.required_sections_text}
                    onChange={(e) => setProfessorMode((prev) => ({ ...prev, required_sections_text: e.target.value }))}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Min Word Count</label>
                  <input
                    type="number"
                    value={professorMode.min_word_count}
                    onChange={(e) => setProfessorMode((prev) => ({ ...prev, min_word_count: Number(e.target.value) || 0 }))}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Max Word Count</label>
                  <input
                    type="number"
                    value={professorMode.max_word_count}
                    onChange={(e) => setProfessorMode((prev) => ({ ...prev, max_word_count: Number(e.target.value) || 0 }))}
                    className="form-input"
                  />
                </div>
                <button
                  onClick={runProfessorCheck}
                  className="btn btn-secondary"
                  disabled={!professorMode.enabled || !paperContent.trim() || checkingProfessorMode}
                >
                  {checkingProfessorMode ? 'Checking...' : 'Run Professor Check'}
                </button>
              </div>
            </div>

            {professorCheck && (
              <div className="professor-check-panel">
                <h3>Live Compliance Results</h3>
                <p className={professorCheck.deviations.length === 0 ? 'status-ok' : 'status-warn'}>
                  {professorCheck.deviations.length === 0
                    ? 'No template deviations detected.'
                    : `${professorCheck.deviations.length} requirement(s) at risk.`}
                </p>

                {professorCheck.rubric_risk?.points_at_risk > 0 && (
                  <p className="status-warn">
                    Points at risk: {professorCheck.rubric_risk.points_at_risk}
                  </p>
                )}

                {professorCheck.deviations.length > 0 && (
                  <ul className="deviation-list">
                    {professorCheck.deviations.map((deviation, idx) => (
                      <li key={`${deviation.requirement}-${idx}`}>
                        <strong>{deviation.requirement}</strong>: expected {String(deviation.expected)}, actual {String(deviation.actual)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {activeStep === 'formatting' && (
          <section className="formatter-section">
            <h2>Formatting Rules</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Citation Style</label>
                <select
                  value={formattingSettings.style}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, style: e.target.value })}
                  className="form-input"
                >
                  {formatOptions?.styles.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Font</label>
                <select
                  value={formattingSettings.font}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, font: e.target.value })}
                  className="form-input"
                >
                  {formatOptions?.fonts.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Font Size</label>
                <select
                  value={formattingSettings.font_size}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, font_size: parseInt(e.target.value, 10) })}
                  className="form-input"
                >
                  {formatOptions?.fontSizes.map((s) => (
                    <option key={s} value={s}>{s}pt</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Line Spacing</label>
                <select
                  value={formattingSettings.line_spacing}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, line_spacing: e.target.value })}
                  className="form-input"
                >
                  {formatOptions?.lineSpacings.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Margins</label>
                <select
                  value={formattingSettings.margins}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, margins: e.target.value })}
                  className="form-input"
                >
                  {formatOptions?.margins.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Page Numbers</label>
                <select
                  value={formattingSettings.page_numbers}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, page_numbers: e.target.value })}
                  className="form-input"
                >
                  {formatOptions?.pageNumbers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formattingSettings.title_page}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, title_page: e.target.checked })}
                />
                Generate Title Page
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formattingSettings.running_head}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, running_head: e.target.checked })}
                />
                Add Running Head
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formattingSettings.simplify_language}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, simplify_language: e.target.checked })}
                />
                Simplify Language
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formattingSettings.humanize_language}
                  onChange={(e) => setFormattingSettings({ ...formattingSettings, humanize_language: e.target.checked })}
                />
                Humanize Language
              </label>
            </div>

            <div className="template-buttons">
              <button onClick={saveTemplate} className="btn btn-secondary">Save as Template</button>
              {templates.length > 0 && (
                <div className="template-list">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => loadTemplate(t)} className="btn btn-small">
                      Load: {t.template_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeStep === 'writing' && (
          <section className="formatter-section">
            <h2>Writing Draft</h2>
            <section className="setup-block metric-block">
              <h2>Progress Snapshot</h2>
              <div className="metric-grid">
                <article className={`metric-card metric-${getScoreStatus(latestScore)}`} key={`score-${latestScore}`}>
                  <div className="metric-head"><span className="metric-icon">SC</span><span>Draft Score</span></div>
                  <strong className="metric-value">{latestScore}</strong>
                  <div className="metric-bar"><div className="metric-bar-fill" style={{ width: `${Math.max(0, Math.min(100, latestScore))}%` }} /></div>
                </article>

                <article className="metric-card metric-good" key={`drafts-${latestDrafts}`}>
                  <div className="metric-head"><span className="metric-icon">DR</span><span>Total Drafts</span></div>
                  <strong className="metric-value">{latestDrafts}</strong>
                </article>

                <article className={`metric-card metric-${getIssueStatus(latestGrammar)}`} key={`grammar-${latestGrammar}`}>
                  <div className="metric-head"><span className="metric-icon">GR</span><span>Grammar Issues</span></div>
                  <strong className="metric-value">{latestGrammar}</strong>
                </article>

                <article className={`metric-card metric-${getIssueStatus(latestSpelling)}`} key={`spelling-${latestSpelling}`}>
                  <div className="metric-head"><span className="metric-icon">SP</span><span>Spelling Issues</span></div>
                  <strong className="metric-value">{latestSpelling}</strong>
                </article>
              </div>

              <div className="score-breakdown-panel">
                <h3>Breakdown</h3>
                {breakdownRows.map((row) => (
                  <div className="score-breakdown-row" key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value == null ? '--' : `${row.value}/${row.outOf}`}</strong>
                  </div>
                ))}
              </div>
            </section>

            <div className="input-methods">
              <div className="method">
                <h3>Write or Paste</h3>
                <textarea
                  value={paperContent}
                  onChange={(e) => setPaperContent(e.target.value)}
                  placeholder="Write here. Live professor checks and draft autosave run in the background."
                  rows={12}
                  className="form-textarea paper-editor"
                  style={{
                    fontFamily: formattingSettings.font || 'Times New Roman',
                    fontSize: `${formattingSettings.font_size || 12}pt`,
                    lineHeight:
                      formattingSettings.line_spacing === 'Double'
                        ? 2
                        : formattingSettings.line_spacing === '1.5'
                        ? 1.5
                        : 1
                  }}
                />
              </div>
              <div className="method">
                <h3>Upload Draft</h3>
                <input type="file" onChange={handlePaperFileUpload} accept=".docx,.pdf,.txt" className="form-input" />
                <p className="hint">Supported: DOCX, PDF, TXT</p>
              </div>
            </div>
          </section>
        )}

        {activeStep === 'output' && (
          <>
            <section className="formatter-section">
              <h2>Final Output</h2>
              <button onClick={handleTransformPaper} disabled={loading || !paperContent.trim()} className="btn btn-primary btn-large">
                {loading ? 'Formatting Paper...' : 'Format Paper'}
              </button>

              {!formattedResult && <p className="hint">Run formatting to preview and download your final paper.</p>}

              {formattedResult && (
                <>
                  <div className="output-preview">
                    <h3>Formatted Paper Preview</h3>
                    <div
                      className="paper-preview-content"
                      style={{
                        fontFamily: formattingSettings.font || 'Times New Roman',
                        fontSize: `${formattingSettings.font_size || 12}pt`,
                        lineHeight:
                          formattingSettings.line_spacing === 'Double'
                            ? 2
                            : formattingSettings.line_spacing === '1.5'
                            ? 1.5
                            : 1
                      }}
                    >
                      <pre>{formattedResult.formatted.substring(0, 1000)}...</pre>
                    </div>
                  </div>

                  {formattedResult.citations && formattedResult.citations.length > 0 && (
                    <div className="citations-display">
                      <h3>Corrected References</h3>
                      <ul>
                        {formattedResult.citations.map((c, i) => (
                          <li key={i}>
                            <strong>{c.author} ({c.year})</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="output-buttons">
                    <button onClick={exportDocx} className="btn btn-export">Download as DOCX</button>
                    <button onClick={exportPdf} className="btn btn-export">Download as PDF</button>
                    <button onClick={copyFormattedText} className="btn btn-secondary">Copy Formatted Text</button>
                  </div>
                </>
              )}
            </section>

            <section className="formatter-section always-history">
              <h2>Draft History</h2>
              {historyLoading ? (
                <p className="library-message">Loading draft history...</p>
              ) : !draftHistory ? (
                <p className="library-message">No draft snapshots yet.</p>
              ) : (
                <div className="history-list">
                  {draftHistory.snapshots.map((snapshot) => (
                    <div className="history-item" key={snapshot.id}>
                      <div>
                        <strong>{new Date(snapshot.created_at).toLocaleString()}</strong>
                        <p>Words: {snapshot.metrics?.word_count || snapshot.word_count}</p>
                      </div>
                      <div>
                        <p>Grammar: {snapshot.metrics?.grammar_issues || 0}</p>
                        <p>Spelling: {snapshot.metrics?.spelling_issues || 0}</p>
                        <p>Clarity: {snapshot.metrics?.clarity_score || 0}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section className="step-controls">
          <button
            onClick={goPreviousStep}
            className="btn btn-secondary"
            disabled={currentStepIndex <= 0}
          >
            Previous Step
          </button>
          <button
            onClick={goNextStep}
            className="btn btn-primary"
            disabled={currentStepIndex >= steps.length - 1}
          >
            Next Step
          </button>
        </section>

        </div>
      </div>
    </div>
  )
}
