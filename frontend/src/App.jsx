import React, { useState, useEffect, useRef } from 'react';
import './index.css';

const API_URL = 'http://localhost:3001/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, []);

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

  const handleTaskAction = async (taskId, status) => {
    try {
      await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (err) {
      console.error("Task Action Error:", err);
    }
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
        <div className="sidebar-header">SQL Agent Chat</div>
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
      </div>

      {/* Main Chat Area */}
      <div className="main-content">
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
                  <p className="final-answer">{msg.finalAnswer}</p>

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
                      <div className="card-header">🔍 Root Cause Investigation</div>
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
                      <div className="section-title">📋 Action Tasks</div>
                      {msg.generatedTasks.tasks.map(task => (
                        <div key={task.id} className="task-item">
                          <div className="task-header">
                            <span className={`priority-tag ${task.priority}`}>{task.priority}</span>
                            <strong>{task.title}</strong>
                          </div>
                          <div className="task-desc">{task.description}</div>
                          <div className="task-meta">Assigned to: {task.assignedTo} | Deadline: {task.deadline}</div>
                          <div className="task-actions">
                            <button className="btn-ok" onClick={() => handleTaskAction(task.id, 'approved')}>Approve</button>
                            <button className="btn-reject" onClick={() => handleTaskAction(task.id, 'rejected')}>Ignore</button>
                          </div>
                        </div>
                      ))}
                    </div>
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
      </div>
    </div>
  );
}

export default App;
