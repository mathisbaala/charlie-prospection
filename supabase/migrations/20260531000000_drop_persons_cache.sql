-- Suppression de prospection_persons_cache — table morte (0 lignes, 0 référence code).
--
-- Cette table était le prototype du cache global de personnes.
-- Elle a été remplacée par prospection_persons (la table réelle, alimentée par les
-- scripts d'ingest RPPS/AE/Sirene). Aucun code ne l'utilise plus.
--
-- Vérification avant suppression :
--   SELECT count(*) FROM prospection_persons_cache;  → 0
--   grep -r "persons_cache" app/ lib/ scripts/ → 0 occurrences

DROP TABLE IF EXISTS prospection_persons_cache;
