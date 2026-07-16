-- SEO Dashboard - Initial Database Schema
-- Phase 1: Core Tables with Authentication & RLS

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
-- Extended user profiles (auth.users handled by Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- =============================================
-- DOMAINS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, domain)
);

-- Indexes for performance
CREATE INDEX idx_domains_user_id ON public.domains(user_id);
CREATE INDEX idx_domains_domain ON public.domains(domain);
CREATE INDEX idx_domains_is_active ON public.domains(is_active);

-- RLS Policies for domains
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own domains"
  ON public.domains FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own domains"
  ON public.domains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own domains"
  ON public.domains FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own domains"
  ON public.domains FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- KEYWORD RANKINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.keyword_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER,
  previous_position INTEGER,
  search_volume INTEGER,
  difficulty NUMERIC(5,2),
  url TEXT,
  country_code TEXT DEFAULT 'US',
  device TEXT DEFAULT 'desktop' CHECK (device IN ('desktop', 'mobile')),
  search_engine TEXT DEFAULT 'google' CHECK (search_engine IN ('google', 'bing', 'yahoo')),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain_id, keyword, country_code, device, recorded_at)
);

-- Indexes for performance
CREATE INDEX idx_keyword_rankings_domain_id ON public.keyword_rankings(domain_id);
CREATE INDEX idx_keyword_rankings_keyword ON public.keyword_rankings(keyword);
CREATE INDEX idx_keyword_rankings_recorded_at ON public.keyword_rankings(recorded_at DESC);
CREATE INDEX idx_keyword_rankings_position ON public.keyword_rankings(position);

-- RLS Policies for keyword_rankings
ALTER TABLE public.keyword_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keyword rankings"
  ON public.keyword_rankings FOR SELECT
  USING (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own keyword rankings"
  ON public.keyword_rankings FOR INSERT
  WITH CHECK (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- BACKLINKS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.backlinks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  domain_rating NUMERIC(5,2),
  url_rating NUMERIC(5,2),
  traffic_estimate INTEGER,
  first_seen TIMESTAMPTZ,
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  link_type TEXT CHECK (link_type IN ('dofollow', 'nofollow', 'ugc', 'sponsored')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain_id, source_url, target_url)
);

-- Indexes for performance
CREATE INDEX idx_backlinks_domain_id ON public.backlinks(domain_id);
CREATE INDEX idx_backlinks_source_url ON public.backlinks(source_url);
CREATE INDEX idx_backlinks_is_active ON public.backlinks(is_active);
CREATE INDEX idx_backlinks_last_checked ON public.backlinks(last_checked DESC);

-- RLS Policies for backlinks
ALTER TABLE public.backlinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backlinks"
  ON public.backlinks FOR SELECT
  USING (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own backlinks"
  ON public.backlinks FOR INSERT
  WITH CHECK (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- PAGE METRICS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.page_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  meta_description TEXT,
  word_count INTEGER,
  internal_links INTEGER,
  external_links INTEGER,
  images_count INTEGER,
  h1_count INTEGER,
  load_time_ms INTEGER,
  status_code INTEGER,
  last_crawled TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain_id, url, last_crawled)
);

-- Indexes for performance
CREATE INDEX idx_page_metrics_domain_id ON public.page_metrics(domain_id);
CREATE INDEX idx_page_metrics_url ON public.page_metrics(url);
CREATE INDEX idx_page_metrics_last_crawled ON public.page_metrics(last_crawled DESC);
CREATE INDEX idx_page_metrics_status_code ON public.page_metrics(status_code);

-- RLS Policies for page_metrics
ALTER TABLE public.page_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own page metrics"
  ON public.page_metrics FOR SELECT
  USING (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own page metrics"
  ON public.page_metrics FOR INSERT
  WITH CHECK (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- WEB VITALS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.web_vitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  lcp NUMERIC(10,2), -- Largest Contentful Paint (ms)
  fid NUMERIC(10,2), -- First Input Delay (ms)
  cls NUMERIC(5,3), -- Cumulative Layout Shift
  fcp NUMERIC(10,2), -- First Contentful Paint (ms)
  ttfb NUMERIC(10,2), -- Time to First Byte (ms)
  performance_score INTEGER CHECK (performance_score >= 0 AND performance_score <= 100),
  device TEXT DEFAULT 'desktop' CHECK (device IN ('desktop', 'mobile')),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain_id, url, device, recorded_at)
);

-- Indexes for performance
CREATE INDEX idx_web_vitals_domain_id ON public.web_vitals(domain_id);
CREATE INDEX idx_web_vitals_url ON public.web_vitals(url);
CREATE INDEX idx_web_vitals_recorded_at ON public.web_vitals(recorded_at DESC);
CREATE INDEX idx_web_vitals_performance_score ON public.web_vitals(performance_score);

-- RLS Policies for web_vitals
ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own web vitals"
  ON public.web_vitals FOR SELECT
  USING (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own web vitals"
  ON public.web_vitals FOR INSERT
  WITH CHECK (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- ALERTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'ranking_drop', 'ranking_gain', 'backlink_lost', 'backlink_gained',
    'vitals_degraded', 'vitals_improved', 'error_page', 'custom'
  )),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_alerts_domain_id ON public.alerts(domain_id);
CREATE INDEX idx_alerts_is_read ON public.alerts(is_read);
CREATE INDEX idx_alerts_created_at ON public.alerts(created_at DESC);
CREATE INDEX idx_alerts_severity ON public.alerts(severity);
CREATE INDEX idx_alerts_alert_type ON public.alerts(alert_type);

-- RLS Policies for alerts
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts"
  ON public.alerts FOR SELECT
  USING (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own alerts"
  ON public.alerts FOR UPDATE
  USING (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own alerts"
  ON public.alerts FOR INSERT
  WITH CHECK (
    domain_id IN (
      SELECT id FROM public.domains WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domains_updated_at
  BEFORE UPDATE ON public.domains
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to get user's total domains count
CREATE OR REPLACE FUNCTION get_user_domains_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.domains
    WHERE user_id = user_uuid AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread alerts count
CREATE OR REPLACE FUNCTION get_unread_alerts_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.alerts a
    JOIN public.domains d ON a.domain_id = d.id
    WHERE d.user_id = user_uuid AND a.is_read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SEED DATA (for testing)
-- =============================================

-- Note: This will only work if there's an authenticated user
-- In production, users will be created through Supabase Auth
-- and domains/data will be added through the application

COMMENT ON TABLE public.users IS 'Extended user profiles linked to Supabase Auth';
COMMENT ON TABLE public.domains IS 'User domains being monitored for SEO';
COMMENT ON TABLE public.keyword_rankings IS 'Historical keyword ranking data';
COMMENT ON TABLE public.backlinks IS 'Backlink profile and history';
COMMENT ON TABLE public.page_metrics IS 'Page-level SEO metrics';
COMMENT ON TABLE public.web_vitals IS 'Core Web Vitals performance data';
COMMENT ON TABLE public.alerts IS 'User notifications and alerts';
