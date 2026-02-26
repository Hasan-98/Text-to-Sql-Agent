import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './index.css';

const API_URL = 'http://localhost:3001/api';

// ==========================
// Chart color palette
// ==========================
const CHART_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#38bdf8'];

const formatValue = (val) => {
  if (typeof val !== 'number') return val;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val % 1 === 0 ? val.toLocaleString() : val.toFixed(2);
};

function ChartRenderer({ data, chartConfig }) {
  if (!data || !chartConfig || data.length === 0) return null;
  let { type, xKey, yKey, title } = chartConfig;

  // Auto-detect keys if the provided ones are missing in the data
  const firstRow = data[0];
  const keys = Object.keys(firstRow);

  // If xKey missing or not in data, find first string/categorical column
  if (!xKey || !keys.includes(xKey)) {
    xKey = keys.find(k => typeof firstRow[k] === 'string') || keys[0];
  }

  // If yKey missing or not in data, find first numeric column
  if (!yKey || !keys.includes(yKey)) {
    yKey = keys.find(k => typeof firstRow[k] === 'number') || keys[1] || keys[0];
  }

  // Ensure y values are numbers and prepare data
  const chartData = data.map(row => ({
    ...row,
    [yKey]: Number(row[yKey]) || 0
  }));

  const containerStyle = { width: '100%', height: 300, marginTop: 12, marginBottom: 8 };
  const tickStyle = { fill: '#94a3b8', fontSize: 11 };
  const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 };

  if (type === 'pie') {
    return (
      <div className="chart-container">
        {title && <div className="chart-title">{title}</div>}
        <ResponsiveContainer style={containerStyle}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={formatValue} contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'line') {
    return (
      <div className="chart-container">
        {title && <div className="chart-title">{title}</div>}
        <ResponsiveContainer style={containerStyle}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey={xKey} tick={tickStyle} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={tickStyle} tickFormatter={formatValue} />
            <Tooltip formatter={formatValue} contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={yKey} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: bar chart
  return (
    <div className="chart-container">
      {title && <div className="chart-title">{title}</div>}
      <ResponsiveContainer style={containerStyle}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey={xKey} tick={tickStyle} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={tickStyle} tickFormatter={formatValue} />
          <Tooltip formatter={formatValue} contentStyle={tooltipStyle} />
          <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={`bar-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});
  const [activeView, setActiveView] = useState('chat'); // 'chat' or 'dashboard'
  const [allTasks, setAllTasks] = useState([]);
  const [dashFilters, setDashFilters] = useState({
    district: '', city: '', store: '', theme: '', responsible: '', status: 'All'
  });
  const [filterOptions, setFilterOptions] = useState({
    districts: [], cities: [], stores: [], themes: [], responsibles: []
  });
  const [dashSummary, setDashSummary] = useState(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetchHistory();
    fetchAllTasks();
    fetchDashOptions();
    fetchMessages();
  }, []);

  useEffect(() => {
    if (activeView === 'dashboard') {
      fetchDashSummary();
    }
  }, [dashFilters, activeView]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/history`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const fetchAllTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`);
      const data = await res.json();
      setAllTasks(data);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/messages`);
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  const fetchDashOptions = async () => {
    try {
      const res = await fetch(`${API_URL}/dashboard/options`);
      const data = await res.json();
      setFilterOptions(data);
    } catch (err) {
      console.error("Failed to fetch dashboard options:", err);
    }
  };

  const fetchDashSummary = async () => {
    try {
      const res = await fetch(`${API_URL}/dashboard/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: dashFilters })
      });
      const data = await res.json();
      setDashSummary(data);
    } catch (err) {
      console.error("Failed to fetch dashboard summary:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { text: input, role: 'user', timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });

      const result = await res.json();

      const agentMessage = {
        role: 'agent',
        timestamp: new Date().toISOString(),
        ...result
      };

      setMessages(prev => [...prev, agentMessage]);
      fetchHistory();
    } catch (err) {
      console.error("Chat Error:", err);
      setMessages(prev => [...prev, { role: 'agent', finalAnswer: "Sorry, I encountered an error. Please check if the backend is running.", error: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = async () => {
    setMessages([]);
    setInput('');
    setExpandedTables({});
    try {
      await fetch(`${API_URL}/chat/clear`, { method: 'POST' });
      fetchHistory(); // Refresh sidebar to show empty state or updated list
    } catch (err) {
      console.error("Failed to clear context:", err);
    }
  };

  const handleHistoryClick = (item) => {
    const historicalMessages = [
      { role: 'user', text: item.userQuery, timestamp: item.timestamp },
      {
        role: 'agent',
        timestamp: item.timestamp,
        finalAnswer: item.finalAnswer,
        queryResult: item.results,
        generatedTasks: item.generatedTasks,
        kpiAnalysis: item.kpiAnalysis, // Include KPI/RootCause if they were saved (though history.results usually just has data)
        rootCauseAnalysis: item.rootCauseAnalysis,
        sqlQuery: item.sqlQuery
      }
    ];
    setMessages(historicalMessages);
  };

  const handleTaskAction = async (msgIdx, taskId, status) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        // Update the task status in the messages state
        setMessages(prev => {
          const newMessages = [...prev];
          const msg = { ...newMessages[msgIdx] };
          if (msg.generatedTasks && msg.generatedTasks.tasks) {
            msg.generatedTasks = {
              ...msg.generatedTasks,
              tasks: msg.generatedTasks.tasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, status } : t
              )
            };
            newMessages[msgIdx] = msg;
          }
          return newMessages;
        });

        // Refresh task list for dashboard
        fetchAllTasks();
        fetchHistory();
      }
    } catch (err) {
      console.error("Task Action Error:", err);
    }
  };

  const handleDashboardAction = async (taskId, status) => {
    // Optimistic update for UI feel
    setAllTasks(prev => prev.map(t => String(t.id) === String(taskId) ? { ...t, status } : t));

    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        // fetchAllTasks(); // Not strictly needed if optimistic update is correct, but good for sync
        fetchHistory();
      }
    } catch (err) {
      console.error("Dashboard Task Action Error:", err);
    }
  };

  const handleResetFilters = () => {
    setDashFilters({
      district: '', city: '', store: '', theme: '', responsible: '', status: 'All'
    });
  };

  const toggleTable = (idx) => {
    setExpandedTables(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const getHealthEmoji = (status) => {
    switch (status) {
      case 'Critical': return '🔴';
      case 'Warning': return '🟡';
      case 'Good': return '🟢';
      case 'Excellent': return '🌟';
      default: return '⚪';
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">SQL Agent Console</div>

        <div className="nav-menu">
          <button
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveView('chat')}
          >
            Chat
          </button>
          <button
            className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            Dashboard
          </button>
        </div>

        {activeView === 'chat' && (
          <>
            <button className="new-chat-btn" onClick={handleNewChat}>+ New Chat</button>
            <div className="history-list">
              <div className="history-label">Recent History</div>
              {history.length > 0 ? history.map((item, idx) => (
                <div key={idx} className="history-item" onClick={() => handleHistoryClick(item)}>
                  {item.userQuery}
                </div>
              )) : (
                <div className="history-item" style={{ opacity: 0.5 }}>No history yet</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {activeView === 'chat' ? (
          <>
            <div className="chat-window">
              {messages.length === 0 && (
                <div className="welcome-screen">
                  <h2>Welcome to Store Analytics</h2>
                  <p>Ask anything about your store metrics, revenue, or efficiency.</p>
                  <div className="example-queries">
                    <div className="query-chip" onClick={() => setInput("Show me top 5 malls by revenue this month")}>"Top 5 malls by revenue"</div>
                    <div className="query-chip" onClick={() => setInput("Which stores have critical efficiency?")}>"Critical efficiency stores"</div>
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
                  {msg.role === 'user' ? (
                    <div>{msg.text}</div>
                  ) : (
                    <div className="agent-response">
                      {/* Ambiguous query — show as question bubble */}
                      {msg.isAmbiguous ? (
                        <div className="clarification-bubble">
                          <span className="clarification-icon">💬</span>
                          <p>{msg.finalAnswer}</p>
                        </div>
                      ) : (
                        <>
                          <p className="final-answer">{msg.finalAnswer}</p>

                          {/* Chart */}
                          {msg.chartConfig && msg.queryResult && (
                            <ChartRenderer data={msg.queryResult} chartConfig={msg.chartConfig} />
                          )}

                          {/* KPI Analysis Card */}
                          {msg.kpiAnalysis && (
                            <div className="kpi-card">
                              <div className="card-header">
                                <span>{getHealthEmoji(msg.kpiAnalysis.healthStatus)} KPI Health: {msg.kpiAnalysis.healthStatus}</span>
                                <span className="score">Score: {msg.kpiAnalysis.overallScore}/100</span>
                              </div>
                              <div className="kpi-findings">
                                {msg.kpiAnalysis.keyFindings?.map((f, i) => (
                                  <div key={i} className="finding-item">• {f}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Root Cause Analysis Card */}
                          {msg.rootCauseAnalysis && (
                            <div className="root-cause-card">
                              <div className="card-header">Root Cause Investigation</div>
                              <div className="causes-list">
                                {msg.rootCauseAnalysis.primaryCauses?.map((cause, i) => (
                                  <div key={i} className="cause-item">
                                    <span className={`impact-badge ${cause.impact}`}>{cause.impact}</span>
                                    <strong>{cause.factor}:</strong> {cause.description}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {msg.queryResult && msg.queryResult.length > 0 && (
                            <div className="table-container">
                              <div className="table-header-row">
                                <span>Query Results ({msg.queryResult.length} rows)</span>
                                {msg.queryResult.length > 5 && (
                                  <button className="view-toggle" onClick={() => toggleTable(idx)}>
                                    {expandedTables[idx] ? 'Show Less' : 'View All'}
                                  </button>
                                )}
                              </div>
                              <table>
                                <thead>
                                  <tr>
                                    {Object.keys(msg.queryResult[0]).map(key => <th key={key}>{key}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(expandedTables[idx] ? msg.queryResult : msg.queryResult.slice(0, 5)).map((row, i) => (
                                    <tr key={i}>
                                      {Object.values(row).map((val, j) => <td key={j}>{typeof val === 'number' ? (val % 1 === 0 ? val.toLocaleString() : val.toFixed(2)) : val}</td>)}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {msg.generatedTasks && msg.generatedTasks.tasks && (
                            <div className="tasks-container">
                              <div className="section-title"> Action Tasks</div>
                              {msg.generatedTasks.tasks.map(task => (
                                <div key={task.id} className="task-item">
                                  <div className="task-header">
                                    <span className={`priority-tag ${task.priority}`}>{task.priority}</span>
                                    <strong>{task.title}</strong>
                                  </div>
                                  <div className="task-desc">{task.description}</div>
                                  <div className="task-meta">Assigned to: {task.assignedTo} | Deadline: {task.deadline}</div>
                                  <div className="task-actions">
                                    {(!task.status || task.status === 'pending') ? (
                                      <>
                                        <button className="btn-ok" onClick={() => handleTaskAction(idx, task.id, 'approved')}>Approve</button>
                                        <button className="btn-reject" onClick={() => handleTaskAction(idx, task.id, 'rejected')}>Ignore</button>
                                      </>
                                    ) : (
                                      <span className={`status-badge ${task.status}`}>
                                        {task.status === 'approved' ? 'Approved' : 'Ignored'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && <div className="message agent"><div className="typing-loader"></div></div>}
              <div ref={chatEndRef} />
            </div>

            <div className="input-area">
              <div className="input-container">
                <input
                  type="text"
                  placeholder="Ask anything about your store metrics..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                />
                <button className="send-btn" onClick={handleSend} disabled={isLoading}>Send</button>
              </div>
            </div>
          </>
        ) : (
          <div className="dashboard-container screen-2">
            <div className="dashboard-header">
              <h2>Operations Strategy Dashboard</h2>
              <p>Last month status: March 2025</p>
            </div>

            <div className="dashboard-top-section">
              {/* Filters */}
              <div className="filter-grid">
                <div className="filter-group">
                  <label>District</label>
                  <select value={dashFilters.district} onChange={e => setDashFilters({ ...dashFilters, district: e.target.value })}>
                    <option value="">All Turkey</option>
                    {filterOptions.districts?.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>City</label>
                  <select value={dashFilters.city} onChange={e => setDashFilters({ ...dashFilters, city: e.target.value })}>
                    <option value="">All Cities</option>
                    {filterOptions.cities?.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Store</label>
                  <select value={dashFilters.store} onChange={e => setDashFilters({ ...dashFilters, store: e.target.value })}>
                    <option value="">All Stores</option>
                    {filterOptions.stores?.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Action Theme</label>
                  <select value={dashFilters.theme} onChange={e => setDashFilters({ ...dashFilters, theme: e.target.value })}>
                    <option value="">All Themes</option>
                    {filterOptions.themes?.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Responsible</label>
                  <select value={dashFilters.responsible} onChange={e => setDashFilters({ ...dashFilters, responsible: e.target.value })}>
                    <option value="">All</option>
                    {filterOptions.responsibles?.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Status</label>
                  <select value={dashFilters.status} onChange={e => setDashFilters({ ...dashFilters, status: e.target.value })}>
                    <option value="All">All</option>
                    <option value="approved">Approved</option>
                    <option value="pending">Waiting</option>
                    <option value="rejected">Declined</option>
                  </select>
                </div>
                <div className="filter-group reset-group">
                  <label>&nbsp;</label>
                  <button className="reset-filters-btn" onClick={handleResetFilters}>
                    Reset Filters
                  </button>
                </div>
              </div>

              {/* AI Summary */}
              {dashSummary && (
                <div className="ai-summary-sidebar">
                  <div className="summary-card">
                    <h3> AI Summary</h3>
                    <div className="summary-preview">
                      <p>{dashSummary.goingWell[0]}</p>
                      <p>{dashSummary.needsImprovement[0]}</p>
                    </div>
                    <button className="expand-link" onClick={() => setSummaryExpanded(true)}>
                      Click to see full summary
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Full Summary Modal */}
            {summaryExpanded && dashSummary && (
              <div className="summary-modal-overlay" onClick={() => setSummaryExpanded(false)}>
                <div className="summary-modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Full Strategy Analysis</h3>
                    <button className="close-btn" onClick={() => setSummaryExpanded(false)}>×</button>
                  </div>
                  <div className="modal-body">
                    <div className="summary-section">
                      <h4>What is going well</h4>
                      <ul>{dashSummary.goingWell.map((p, i) => <li key={i}>{p}</li>)}</ul>
                    </div>
                    <div className="summary-section">
                      <h4>What needs improvement</h4>
                      <ul>{dashSummary.needsImprovement.map((p, i) => <li key={i}>{p}</li>)}</ul>
                    </div>
                    <div className="summary-section">
                      <h4>Actions suggested</h4>
                      <ul>{dashSummary.actionsSuggested.map((p, i) => <li key={i}>{p}</li>)}</ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Task Table */}
            <div className="dashboard-table-container">
              <table className="screen-2-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action Theme</th>
                    <th>District</th>
                    <th>City</th>
                    <th>Store</th>
                    <th>Suggested Action</th>
                    <th>Responsible</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allTasks
                    .filter(t => {
                      if (dashFilters.district && t.district !== dashFilters.district) return false;
                      if (dashFilters.city && t.city !== dashFilters.city) return false;
                      if (dashFilters.store && t.storeName !== dashFilters.store) return false;
                      if (dashFilters.theme && t.actionTheme !== dashFilters.theme) return false;
                      if (dashFilters.responsible && t.responsible !== dashFilters.responsible) return false;
                      if (dashFilters.status !== 'All' && t.status !== dashFilters.status.toLowerCase()) return false;
                      return true;
                    })
                    .map(task => (
                      <tr key={task.id}>
                        <td>{task.date || 'Today'}</td>
                        <td>{task.actionTheme || 'Operational'}</td>
                        <td>{task.district || 'General'}</td>
                        <td>{task.city || 'All Turkey'}</td>
                        <td>{task.storeName || 'Multiple'}</td>
                        <td className="task-title-cell">{task.title}</td>
                        <td>{task.responsible || task.assignedTo || 'Operations Manager'}</td>
                        <td>
                          <select
                            className={`status-select ${task.status}`}
                            value={task.status}
                            onChange={(e) => handleDashboardAction(task.id, e.target.value)}
                          >
                            <option value="pending">Waiting</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Declined</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {allTasks.length === 0 && <div className="empty-state">No tasks found</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
