import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'admin' | 'user' | 'viewer'
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'user' | 'viewer'
          avatar_url?: string | null
        }
        Update: {
          full_name?: string | null
          role?: 'admin' | 'user' | 'viewer'
          avatar_url?: string | null
        }
      }
      domains: {
        Row: {
          id: string
          user_id: string
          domain: string
          display_name: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          domain: string
          display_name?: string | null
          is_active?: boolean
        }
        Update: {
          domain?: string
          display_name?: string | null
          is_active?: boolean
        }
      }
      keyword_rankings: {
        Row: {
          id: string
          domain_id: string
          keyword: string
          position: number | null
          previous_position: number | null
          search_volume: number | null
          difficulty: number | null
          url: string | null
          country_code: string
          device: 'desktop' | 'mobile'
          search_engine: 'google' | 'bing' | 'yahoo'
          recorded_at: string
          created_at: string
        }
      }
      backlinks: {
        Row: {
          id: string
          domain_id: string
          source_url: string
          target_url: string
          anchor_text: string | null
          domain_rating: number | null
          url_rating: number | null
          traffic_estimate: number | null
          first_seen: string | null
          last_checked: string
          is_active: boolean
          link_type: 'dofollow' | 'nofollow' | 'ugc' | 'sponsored' | null
          created_at: string
        }
      }
      page_metrics: {
        Row: {
          id: string
          domain_id: string
          url: string
          title: string | null
          meta_description: string | null
          word_count: number | null
          internal_links: number | null
          external_links: number | null
          images_count: number | null
          h1_count: number | null
          load_time_ms: number | null
          status_code: number | null
          last_crawled: string
          created_at: string
        }
      }
      web_vitals: {
        Row: {
          id: string
          domain_id: string
          url: string
          lcp: number | null
          fid: number | null
          cls: number | null
          fcp: number | null
          ttfb: number | null
          performance_score: number | null
          device: 'desktop' | 'mobile'
          recorded_at: string
          created_at: string
        }
      }
      alerts: {
        Row: {
          id: string
          domain_id: string
          alert_type: 'ranking_drop' | 'ranking_gain' | 'backlink_lost' | 'backlink_gained' | 'vitals_degraded' | 'vitals_improved' | 'error_page' | 'custom'
          severity: 'critical' | 'warning' | 'info'
          title: string
          description: string | null
          metadata: Record<string, any> | null
          is_read: boolean
          created_at: string
          read_at: string | null
        }
      }
    }
  }
}
