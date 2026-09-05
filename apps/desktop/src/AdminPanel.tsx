import { useEffect, useState } from 'react'
import { API_BASE } from './api'

interface AdminUser {
  user_id: number
  username: string
  role: string
  target_id?: string | null
  token?: string
}

// ============== 管理面板组件 ==============
export function AdminPanel({ currentUser }: { currentUser: AdminUser }) {
  const [users, setUsers] = useState<Array<{
    id: number; username: string; avatar: string; level: number; xp: number;
    streak_days: number; role: string; target_id: string | null; created_at: string;
    role_label: string;
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const authHeaders = (json = false): Record<string, string> => {
    const headers: Record<string, string> = {}
    if (currentUser.token) headers['Authorization'] = `Bearer ${currentUser.token}`
    if (json) headers['Content-Type'] = 'application/json'
    return headers
  }

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`${API_BASE}/admin/users?operator_id=${currentUser.user_id}`, {
        headers: authHeaders(),
      })
      const data = await resp.json()
      if (resp.ok) {
        setUsers(data.users || [])
      } else {
        setError(data.detail || '获取用户列表失败')
      }
    } catch (err) {
      setError('网络错误，请确认后端已启动')
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const setRole = async (userId: number, newRole: string) => {
    if (userId === currentUser.user_id && currentUser.role === 'super_admin' && newRole !== 'super_admin') {
      if (!confirm('确定要将自己的超级管理员身份移除吗？')) return
    }
    setActionLoading(userId)
    try {
      const resp = await fetch(`${API_BASE}/admin/users/${userId}/role?role=${newRole}`, {
        method: 'POST',
        headers: authHeaders(true),
      })
      const data = await resp.json()
      if (resp.ok) {
        await fetchUsers()
      } else {
        alert(data.detail || '操作失败')
      }
    } catch {
      alert('网络错误')
    }
    setActionLoading(null)
  }

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可撤销。`)) return
    setActionLoading(userId)
    try {
      const resp = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const data = await resp.json()
      if (resp.ok) {
        await fetchUsers()
      } else {
        alert(data.detail || '删除失败')
      }
    } catch {
      alert('网络错误')
    }
    setActionLoading(null)
  }

  const roleBadge = (role: string, target_id: string | null) => {
    const badges: Record<string, { bg: string; color: string; icon: string; label: string }> = {
      super_admin: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', icon: 'fa-crown', label: '超级管理员' },
      admin: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', icon: 'fa-shield-alt', label: '管理员' },
      student: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', icon: 'fa-user', label: '学生' },
    }
    const b = badges[role] || badges.student
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
        background: b.bg, color: b.color,
      }}>
        <i className={`fas ${b.icon}`}></i>
        {b.label}
        {target_id && <span style={{ marginLeft: '4px', fontFamily: 'monospace' }}>({target_id})</span>}
      </span>
    )
  }

  if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <i className="fas fa-lock" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}></i>
        <div style={{ fontSize: '16px' }}>需要管理员权限才能访问此页面</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>
          <i className="fas fa-shield-alt" style={{ marginRight: '10px', color: 'var(--primary-light)' }}></i>
          管理面板
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
          {currentUser.role === 'super_admin' ? '超级管理员' : '管理员'} · ID: {currentUser.target_id || '-'}
        </p>
      </div>

      {/* 用户管理 */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <i className="fas fa-users"></i> 用户管理 ({users.length}人)
          </div>
          <button className="btn btn-secondary" onClick={fetchUsers} disabled={loading}>
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync'}`}></i> 刷新
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', margin: '16px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '13px',
          }}>
            <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>{error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px' }}></i>
            <div style={{ marginTop: '10px' }}>正在加载用户列表...</div>
          </div>
        ) : (
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map((u) => (
                <div key={u.id} style={{
                  padding: '16px', borderRadius: '12px',
                  border: u.id === currentUser.user_id ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: u.id === currentUser.user_id ? 'rgba(99,102,241,0.05)' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', gap: '16px',
                  opacity: actionLoading === u.id ? 0.6 : 1,
                  transition: 'var(--transition)',
                }}>
                  {/* 用户头像 */}
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: u.role === 'super_admin' ? 'linear-gradient(135deg, #ef4444, #f97316)' :
                      u.role === 'admin' ? 'linear-gradient(135deg, #6366f1, #818cf8)' :
                        'linear-gradient(135deg, #334155, #475569)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: 700, flexShrink: 0,
                  }}>
                    {u.avatar || u.username[0]}
                  </div>

                  {/* 用户信息 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{u.username}</span>
                      {u.id === currentUser.user_id && (
                        <span style={{ fontSize: '11px', color: 'var(--primary-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          当前用户
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span><i className="fas fa-star" style={{ marginRight: '4px', color: '#fbbf24' }}></i>Lv.{u.level}</span>
                      <span><i className="fas fa-bolt" style={{ marginRight: '4px', color: '#10b981' }}></i>{u.xp} XP</span>
                      <span><i className="fas fa-fire" style={{ marginRight: '4px', color: '#f97316' }}></i>{u.streak_days}天连续</span>
                      <span style={{ color: 'var(--text-muted)' }}>ID: {u.id}</span>
                    </div>
                  </div>

                  {/* 角色标识 */}
                  <div>{roleBadge(u.role, u.target_id)}</div>

                  {/* 操作按钮 */}
                  {u.role !== 'super_admin' && currentUser.role === 'super_admin' && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {u.role === 'student' ? (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => setRole(u.id, 'admin')}
                          disabled={actionLoading !== null}
                        >
                          <i className="fas fa-user-shield"></i> 设为管理员
                        </button>
                      ) : u.role === 'admin' ? (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => setRole(u.id, 'student')}
                          disabled={actionLoading !== null}
                        >
                          <i className="fas fa-user"></i> 取消管理员
                        </button>
                      ) : null}
                      {u.role !== 'super_admin' && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 12px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => deleteUser(u.id, u.username)}
                          disabled={actionLoading !== null}
                        >
                          <i className="fas fa-trash"></i> 删除
                        </button>
                      )}
                    </div>
                  )}
                  {actionLoading === u.id && (
                    <i className="fas fa-spinner fa-spin" style={{ color: 'var(--primary-light)' }}></i>
                  )}
                </div>
              ))}
            </div>

            {/* 统计信息 */}
            <div style={{
              marginTop: '20px', padding: '16px', borderRadius: '10px',
              background: 'var(--bg-main)', display: 'flex', gap: '24px',
              fontSize: '13px', color: 'var(--text-secondary)', border: '1px solid var(--border)',
            }}>
              <div><i className="fas fa-users" style={{ marginRight: '6px' }}></i>总用户: {users.length}</div>
              <div><i className="fas fa-crown" style={{ marginRight: '6px', color: '#ef4444' }}></i>超管: {users.filter(u => u.role === 'super_admin').length}</div>
              <div><i className="fas fa-shield-alt" style={{ marginRight: '6px', color: '#818cf8' }}></i>管理员: {users.filter(u => u.role === 'admin').length}</div>
              <div><i className="fas fa-user" style={{ marginRight: '6px', color: '#94a3b8' }}></i>学生: {users.filter(u => u.role === 'student').length}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
