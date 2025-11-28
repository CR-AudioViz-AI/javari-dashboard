// lib/supabase/server.ts
// CR AudioViz AI - Server-side Supabase utilities
// Timestamp: 2025-11-28

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin client for server-side operations
export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Database query helpers
export async function getApps(limit = 10) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Error fetching apps:', error)
    return []
  }
  return data || []
}

export async function getAppCount() {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('apps')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  
  if (error) {
    console.error('Error counting apps:', error)
    return 0
  }
  return count || 0
}

export async function getUserCredits(userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) {
    console.error('Error fetching user credits:', error)
    return null
  }
  return data
}

export async function getUserProfile(userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }
  return data
}

export async function getAdminStats() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('admin_stats')
    .select('*')
    .single()
  
  if (error) {
    console.error('Error fetching admin stats:', error)
    return {
      total_users: 0,
      active_alerts: 0,
      events_24h: 0,
      total_savings_platform: 0
    }
  }
  return data
}

export async function getTotalUsers() {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
  
  if (error) {
    console.error('Error counting users:', error)
    return 0
  }
  return count || 0
}

export async function getRecentActivity(limit = 10) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Error fetching activity:', error)
    return []
  }
  return data || []
}

export async function getSystemHealth() {
  const supabase = createAdminClient()
  
  // Get bot health metrics
  const { data: botHealth } = await supabase
    .from('bot_health_metrics')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(9)
  
  // Get recent errors
  const { data: errors } = await supabase
    .from('error_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  return {
    bots: botHealth || [],
    errors: errors || [],
    status: errors && errors.length > 0 ? 'warning' : 'healthy'
  }
}

export async function getRevenueStats() {
  const supabase = createAdminClient()
  
  // Get credit transactions for revenue
  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('amount, type, created_at')
    .eq('type', 'purchase')
    .order('created_at', { ascending: false })
  
  const totalRevenue = transactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0
  
  return {
    totalRevenue,
    transactions: transactions || []
  }
}
