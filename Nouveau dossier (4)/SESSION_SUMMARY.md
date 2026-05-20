# Session de débogage — Bluestift Web / Raya Rooms
**Date :** 18 avril 2026  
**Projet Supabase :** `jkcztwqxvmsrfqiwvyxp` (Bluestift_Web, eu-west-2)

---

## 1. Problèmes identifiés et corrigés

### 1.1 RLS — Rooms visibles par tout le monde

**Cause :** Deux policies SELECT coexistaient sur `study_rooms` avec un `OR` implicite entre elles :
- `study_rooms_participant_or_owner_select` — correcte (créateur OU participant)
- `study_rooms_select` — **coupable** : `is_active = true` → toute room active était visible par n'importe quel user authentifié

**Fix appliqué :** Suppression de `study_rooms_select`. La policy correcte a été recréée proprement.

**Logique finale :**
```
SELECT autorisé si :
  ├── tu es le créateur de la room
  ├── tu es dans study_room_participants
  └── la room est visibility = 'public'  (lien de partage)
```

---

### 1.2 Realtime — Messages invisibles pour les autres membres

**Cause #1 — `study_room_participants` absente de la publication Realtime**  
La table n'était pas dans `supabase_realtime` → aucun événement de présence ne transitait.

**Cause #2 — Policy INSERT sur `messages` trop restrictive**  
L'insert n'était autorisé que si la conversation appartenait à l'utilisateur (`conversations.user_id = moi`). Dans une room, la conversation appartient au créateur → les autres membres ne pouvaient pas écrire. Supabase rejetait silencieusement.

**Cause #3 — `REPLICA IDENTITY DEFAULT` sur toutes les tables**  
Avec RLS activé, Supabase Realtime a besoin de `REPLICA IDENTITY FULL` pour filtrer les événements UPDATE/DELETE par utilisateur. Sans ça, les updates de `study_rooms` (timer, online_count…) ne passaient pas correctement.

**Cause #4 — Pas de `sender_user_id` dans `messages`**  
La table `messages` ne portait que `sender: 'user' | 'assistant'`, sans référence à l'utilisateur réel. Impossible de savoir côté réception qui a écrit un message, d'où l'affichage générique "Teammate" pour tous.

**Cause #5 — Pas de subscription sur `study_room_participants` dans `StudyRoomShell`**  
La liste de présence n'était jamais mise à jour en live. Le code de subscription existant mélangeait presence + messages dans un seul channel sans filtres propres.

---

### 1.3 Policy `study_room_participants` SELECT — chacun ne voyait que lui-même

**Cause :** `srp_owner_access` (ALL) autorisait uniquement `user_id = moi`, donc un membre ne pouvait pas lire les lignes des autres participants.

**Fix :** Séparation en deux policies :
- `srp_select` : je vois tous les participants des rooms dont je fais partie
- `srp_insert_delete` : je gère uniquement ma propre ligne

---

## 2. Migrations appliquées

| Migration | Description |
|---|---|
| `fix_study_rooms_rls_select_policy` | Suppression de la policy trop permissive sur `study_rooms` |
| `study_rooms_select_policy_with_visibility` | Ajout de la condition `visibility = 'public'` pour les liens de partage |
| `fix_realtime_rooms_messages` | Publication Realtime, REPLICA IDENTITY FULL, policies messages et participants |
| `add_sender_user_id_to_messages` | Nouvelle colonne `sender_user_id uuid` sur `messages` |

---

## 3. Fichiers livrés

| Fichier | Rôle |
|---|---|
| `useRoomSession.ts` | Hook qui gère le chargement initial + Realtime messages + Realtime présence |
| `roomMessageAdapter.ts` | Convertit `RoomMessage` → `RoomEvent` (pour `RoomMessageBubble`) |
| `StudyRoomShell.tsx` | Version corrigée : subscription remplacée par `useRoomSession`, liste membres live |

---

## 4. Ce qui reste à faire (voir cahier des charges)

- Passer `currentDbUserId` depuis le parent de `StudyRoomShell`
- Passer `sender_user_id` dans les inserts de messages côté API route (`/api/raya/stream`)
- Implémenter les items listés dans le cahier des charges
