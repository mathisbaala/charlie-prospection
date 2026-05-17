-- Remet les enrôlements en statut "failed" dans le pipeline actif.
-- À exécuter via Supabase Studio (SQL Editor) ou `supabase db execute --file ...`.
--
-- Logique :
--   - Si linkedin_url_resolved est NULL → repart en 'pending' (refera la search)
--   - Si linkedin_url_resolved est défini → repart en 'profile_search' (enverra l'invitation directement)
--   - fail_count reset à 0 pour éviter de retomber en failed dès le prochain échec

update prospection_campaign_enrollments
   set status = case
                  when linkedin_url_resolved is null then 'pending'
                  else 'profile_search'
                end,
       fail_count = 0,
       last_action_at = null
 where status = 'failed';

-- Pour cibler une org spécifique (ex : ton compte de dev) :
--
-- update prospection_campaign_enrollments
--    set status = case
--                   when linkedin_url_resolved is null then 'pending'
--                   else 'profile_search'
--                 end,
--        fail_count = 0,
--        last_action_at = null
--  where status = 'failed'
--    and org_id = 'ton-org-uuid-ici';
