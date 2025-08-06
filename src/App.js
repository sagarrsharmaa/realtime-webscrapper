
// src/App.js - React Frontend connected to FastAPI backend
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Play, Pause, Settings, Globe, Activity, Database, Shield, AlertTriangle, CheckCircle, XCircle, Clock, Target, Plus } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000/api';
const WS_URL = 'ws://localhost:8000/ws';

const ScrapingDashboard = () => {
  const [activeJobs, setActiveJobs] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [analytics, setAnalytics] = useState({
    successRate: 0,
    totalRequests: 0,
    dataPoints: 0,
    activeSessions: 0
  });
  const [logs, setLogs] = useState([]);
  const [ws, setWs] = useState(null);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // Real-time scraped items state
  const [scrapedItems, setScrapedItems] = useState([]);

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const websocket = new WebSocket(WS_URL);
      
      websocket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setWs(websocket);
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'job_update':
              setActiveJobs(prev => 
                prev.map(job => job.id === data.job.id ? data.job : job)
              );
              break;
            case 'job_complete':
              setActiveJobs(prev => 
                prev.map(job => job.id === data.job.id ? data.job : job)
              );
              addLog(`Job "${data.job.name}" completed with ${data.total_items} items`, 'success');
              break;
            case 'log':
              addLog(data.message, data.level);
              break;
            case 'scraped_items':
              // Append new scraped items to state
              setScrapedItems(prev => [...prev, ...data.items.map(item => ({...item, job_id: data.job_id, page: data.page, timestamp: data.timestamp}))]);
              break;
            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close();
      }
      // Clear scraped items on unmount
      setScrapedItems([]);
    };
  }, []);

  // Fetch data from API
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`);
      const data = await response.json();
      setActiveJobs(data.jobs || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      addLog('Failed to fetch jobs from server', 'error');
    }
  }, []);

  const fetchProxies = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/proxies`);
      const data = await response.json();
      setProxies(data.proxies || []);
    } catch (error) {
      console.error('Error fetching proxies:', error);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchJobs();
    fetchProxies();
    fetchAnalytics();
    
    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      fetchJobs();
      fetchAnalytics();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchJobs, fetchProxies, fetchAnalytics]);

  const addLog = (message, level = 'info') => {
    const newLog = {
      id: Date.now(),
      time: new Date().toISOString(),
      level,
      message
    };
    
    setLogs(prev => [newLog, ...prev.slice(0, 9)]);
  };

  const createJob = async (jobData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData),
      });
      
      if (response.ok) {
        const result = await response.json();
        addLog(`Created job: ${result.job.name}`, 'success');
        fetchJobs();
        setShowCreateJob(false);
      } else {
        addLog('Failed to create job', 'error');
      }
    } catch (error) {
      console.error('Error creating job:', error);
      addLog('Error creating job', 'error');
    }
  };

  const toggleJobStatus = async (jobId, currentStatus) => {
    const endpoint = currentStatus === 'running' ? 'pause' : 'start';
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/${endpoint}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const result = await response.json();
        addLog(`Job ${endpoint}ed successfully`, 'info');
        fetchJobs();
      } else {
        addLog(`Failed to ${endpoint} job`, 'error');
      }
    } catch (error) {
      console.error(`Error ${endpoint}ing job:`, error);
      addLog(`Error ${endpoint}ing job`, 'error');
    }
  };

  const createDemoJob = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/quick-start`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const result = await response.json();
        addLog('Demo job created successfully', 'success');
        fetchJobs();
      } else {
        addLog('Failed to create demo job', 'error');
      }
    } catch (error) {
      console.error('Error creating demo job:', error);
      addLog('Error creating demo job', 'error');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'text-green-400';
      case 'paused': return 'text-yellow-400';
      case 'completed': return 'text-blue-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return <Activity className="w-4 h-4" />;
      case 'paused': return <Pause className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const proxyDistribution = [
    { name: 'US', value: 35, color: '#0ea5e9' },
    { name: 'UK', value: 25, color: '#10b981' },
    { name: 'DE', value: 20, color: '#f59e0b' },
    { name: 'JP', value: 12, color: '#ef4444' },
    { name: 'CA', value: 8, color: '#8b5cf6' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-cyan-500/30 p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Globe className="w-8 h-8 text-cyan-400" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                ScrapeMaster
              </h1>
            </div>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
              isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
              }`} />
              <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={createDemoJob}
              className="flex items-center space-x-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-all"
            >
              <Play className="w-4 h-4" />
              <span>Quick Demo</span>
            </button>
            <button
              onClick={() => setShowCreateJob(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Job</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Jobs */}
          <div className="lg:col-span-2 bg-black/20 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-cyan-400">Active Scraping Jobs</h2>
              <span className="text-sm text-gray-400">{activeJobs.length} jobs</span>
            </div>
            
            {activeJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active jobs. Create one to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeJobs.map(job => (
                  <div key={job.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 hover:border-cyan-500/30 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                          job.status === 'running' ? 'bg-green-500/20' :
                          job.status === 'paused' ? 'bg-yellow-500/20' :
                          job.status === 'completed' ? 'bg-blue-500/20' : 'bg-red-500/20'
                        }`}>
                          <div className={getStatusColor(job.status)}>
                            {getStatusIcon(job.status)}
                          </div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{job.name}</h3>
                          <p className="text-sm text-gray-400">{job.url}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleJobStatus(job.id, job.status)}
                        disabled={job.status === 'completed' || job.status === 'error'}
                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {job.status === 'running' ? 'Pause' : 'Resume'}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-400">Progress</p>
                        <p className="font-semibold">{job.progress?.toFixed(1) || 0}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Items Scraped</p>
                        <p className="font-semibold">{job.items_scraped?.toLocaleString() || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Requests/min</p>
                        <p className="font-semibold">{job.requests_per_min || 0}</p>
                      </div>
                    </div>
                    
                    <div className="w-full bg-gray-700/50 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${job.progress || 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Proxy Status */}
          <div className="bg-black/20 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-cyan-400">Proxy Network</h2>
              <span className="text-sm text-gray-400">{proxies.filter(p => p.status === 'active').length} active</span>
            </div>
            
            <div className="space-y-3 mb-6">
              {proxies.map(proxy => (
                <div key={proxy.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      proxy.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                    }`} />
                    <div>
                      <p className="text-sm font-semibold">{proxy.ip}:{proxy.port}</p>
                      <p className="text-xs text-gray-400">{proxy.country}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{proxy.response_time}ms</p>
                    <p className="text-xs text-green-400">{proxy.success_rate}%</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Geographic Distribution</h3>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={proxyDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={60}
                    dataKey="value"
                  >
                    {proxyDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      {/* Live Scraped Items */}
      <div className="bg-black/20 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-cyan-400">Live Scraped Data</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-400">{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
        <div className="space-y-2 h-64 overflow-y-auto">
          {scrapedItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No scraped data yet. Start a job to see live results!</p>
            </div>
          ) : (
            scrapedItems.map((item, idx) => (
              <div key={idx} className="flex items-start space-x-3 p-2 hover:bg-gray-800/30 rounded border-b border-gray-700/30">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs text-gray-400">Job: {item.job_id}</span>
                    <span className="text-xs text-blue-400">Page: {item.page}</span>
                    <span className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <pre className="text-xs text-gray-200 bg-gray-800 rounded p-2 overflow-x-auto">{JSON.stringify(item, null, 2)}</pre>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live Logs */}
      <div className="bg-black/20 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-cyan-400">Live Activity Logs</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-400">{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
        <div className="space-y-2 h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No activity logs yet. Start a job to see live updates!</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="flex items-start space-x-3 p-2 hover:bg-gray-800/30 rounded">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  log.level === 'success' ? 'bg-green-400' :
                  log.level === 'warning' ? 'bg-yellow-400' :
                  log.level === 'error' ? 'bg-red-400' : 'bg-blue-400'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">
                      {new Date(log.time).toLocaleTimeString()}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      log.level === 'success' ? 'bg-green-500/20 text-green-400' :
                      log.level === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                      log.level === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{log.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>

      {/* Create Job Modal */}
      {showCreateJob && (
        <CreateJobModal 
          onClose={() => setShowCreateJob(false)}
          onSubmit={createJob}
        />
      )}
    </div>
  );
};

// Create Job Modal Component
const CreateJobModal = ({ onClose, onSubmit }) => {
  const [jobData, setJobData] = useState({
    name: '',
    url: '',
    selectors: {
      container: 'div.product',
      title: '.title',
      price: '.price',
      description: '.description'
    },
    max_pages: 5,
    delay: 1.0,
    use_proxy: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(jobData);
  };

  const updateSelector = (key, value) => {
    setJobData(prev => ({
      ...prev,
      selectors: {
        ...prev.selectors,
        [key]: value
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-cyan-500/30 rounded-xl p-6 w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-cyan-400">Create Scraping Job</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Job Name</label>
            <input
              type="text"
              value={jobData.name}
              onChange={(e) => setJobData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              placeholder="e.g., E-commerce Product Scraper"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Target URL</label>
            <input
              type="url"
              value={jobData.url}
              onChange={(e) => setJobData(prev => ({ ...prev, url: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              placeholder="https://example.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Max Pages</label>
              <input
                type="number"
                value={jobData.max_pages}
                onChange={(e) => setJobData(prev => ({ ...prev, max_pages: parseInt(e.target.value) }))}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                min="1"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Delay (seconds)</label>
              <input
                type="number"
                step="0.1"
                value={jobData.delay}
                onChange={(e) => setJobData(prev => ({ ...prev, delay: parseFloat(e.target.value) }))}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                min="0.1"
                max="10"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">CSS Selectors</label>
            <div className="space-y-2">
              {Object.entries(jobData.selectors).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <span className="w-24 text-sm text-gray-400 capitalize">{key}:</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateSelector(key, e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:border-cyan-500 focus:outline-none"
                    placeholder={`CSS selector for ${key}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="use_proxy"
              checked={jobData.use_proxy}
              onChange={(e) => setJobData(prev => ({ ...prev, use_proxy: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="use_proxy" className="text-sm text-gray-300">Use proxy rotation</label>
          </div>

          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-all"
            >
              Create Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScrapingDashboard;

