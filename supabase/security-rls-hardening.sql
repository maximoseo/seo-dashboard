-- =============================================================================
-- RLS HARDENING — Supabase project sunrupuwvpalipiuebcv
-- Source: Supabase security advisor, 2026-07-23 (20 ERROR / 55 WARN findings)
-- Priority #2 (Authentication hardening): the Express API returns 401 on every
-- data route, but the anon key is public in the frontend bundle and these tables
-- are readable/writable directly by the anon role — bypassing the app login.
--
-- ⚠️ DO NOT run blindly. This is a SHARED database used by several dashboards
--    (yt_*, aiv_*, si_*, ao_*, repo_*, content_pages, …). Enabling RLS with no
--    policy BLOCKS anon/authenticated access to a table. That is the correct fix
--    for server-owned tables (the server uses the service_role key, which BYPASSES
--    RLS and keeps working) — but if ANY app reads one of these tables directly
--    with the anon key on the client, that read will break.
--
-- HOW TO RUN SAFELY:
--   1. Confirm each table is server-only (service_role) for every app on this DB.
--   2. Run inside a transaction, one logical group at a time, and test after each.
--   3. For tables that DO need client reads, add a scoped policy (templates below)
--      instead of leaving RLS enabled with no policy.
--   4. Re-run the Supabase security advisor — target: 0 `rls_disabled_in_public`.
-- =============================================================================

BEGIN;

-- ---- 1. Enable RLS on the 19 exposed tables ---------------------------------
-- After this, only the service_role (server) can access them, until a policy is
-- added. This immediately closes the anon-key exposure.
ALTER TABLE public.audit_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_findings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_archive        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_suggestions ENABLE ROW LEVEL SECURITY;  -- 1,222 rows exposed
ALTER TABLE public.aiv_engines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_metrics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_monitors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_monitor_checks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.si_monitor_alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aiv_seo_context       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aiv_login_attempts    ENABLE ROW LEVEL SECURITY;  -- login-attempt data
ALTER TABLE public.alert_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_daily          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users           ENABLE ROW LEVEL SECURITY;  -- 🔴 admin table exposed
ALTER TABLE public.checks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents             ENABLE ROW LEVEL SECURITY;

-- Verify nothing else regressed before committing:
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('admin_users','aiv_login_attempts','dashboard_suggestions');

COMMIT;

-- =============================================================================
-- 2. Fix the 29 `rls_policy_always_true` policies (RLS on, USING (true) = public)
--    List them, then replace each with a scoped condition. Example query to find:
--
--   SELECT schemaname, tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname='public' AND qual='true';
--
--    Then, per policy, DROP and recreate scoped. Templates:
-- -----------------------------------------------------------------------------

-- Template A — server-only table (no client access; server uses service_role):
--   (just ENABLE RLS above and add NO policy — service_role bypasses RLS)

-- Template B — authenticated users can read their own workspace rows:
--   DROP POLICY IF EXISTS "<old_always_true_policy>" ON public.<table>;
--   CREATE POLICY "read_own_workspace" ON public.<table>
--     FOR SELECT TO authenticated
--     USING (workspace_id IN (
--       SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
--     ));

-- Template C — owner-scoped by user id:
--   CREATE POLICY "owner_rw" ON public.<table>
--     FOR ALL TO authenticated
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 3. Lock down SECURITY DEFINER functions + set search_path
--    (advisor: 10 functions executable by anon/authenticated; 15 mutable search_path)
--
--   REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM anon, authenticated;
--   ALTER FUNCTION public.<fn>(...) SET search_path = public, pg_temp;
--
--    Repeat for: increment_repo_view_count, handle_new_user, get_user_domains_count,
--    get_unread_alerts_count, is_workspace_member, and the others in the advisor.
-- =============================================================================
