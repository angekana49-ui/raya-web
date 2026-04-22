# Cahier des charges — Raya Rooms (Chat Live)
**Projet :** Bluestift Web  
**Périmètre :** Feature "Study Rooms" — chat collaboratif en temps réel avec IA  
**Statut :** En cours de stabilisation

---

## PARTIE 1 — Corrections bloquantes restantes

### 1.1 Passer `currentDbUserId` au composant `StudyRoomShell`

**Priorité : CRITIQUE**

`StudyRoomShell` reçoit déjà `currentUserId` (auth.uid) mais pas le `public.users.id` (DB user id) qui sert à identifier l'auteur des messages.

**À faire :**
- Exposer `currentDbUserId` depuis le contexte utilisateur ou le hook parent
- La fonction `getDbUserId()` existe déjà dans `study-rooms.service.ts` via RPC `get_db_user_id`
- Le stocker au niveau du contexte global (ex: dans `useAuth` ou un `UserContext`) pour ne pas l'appeler à chaque render
- Le passer en prop à `StudyRoomShell` et à `useRoomSession`

**Fichiers concernés :** `useAuth.ts`, parent de `StudyRoomShell`, `StudyRoomShell.tsx`

---

### 1.2 Passer `sender_user_id` dans les inserts de messages côté API

**Priorité : CRITIQUE**

La colonne `messages.sender_user_id` a été ajoutée en DB. Elle doit être renseignée lors de chaque insert pour que les autres membres sachent qui a écrit.

**À faire :**
- Dans `/api/raya/stream` (route API principale) : résoudre le `db_user_id` de l'appelant et l'inclure dans l'insert du message utilisateur
- Le message assistant (`sender = 'assistant'`) laisse `sender_user_id = NULL`
- S'assurer que le `sendMessage` de `useRoomSession` passe bien `sender_user_id` (déjà implémenté, vérifier que `currentDbUserId` est bien reçu)

**Fichiers concernés :** `/api/raya/stream/route.ts`, `useRoomSession.ts`

---

### 1.3 Supprimer les messages dupliqués lors du streaming

**Priorité : HAUTE**

Lors d'un envoi, le flux actuel crée :
1. Un message optimiste local (temp id `user-xxx`)
2. Le Realtime reçoit le vrai message depuis la DB

Risque de doublon si la logique de matching échoue (ex: `pendingTurnRef` périmé).

**À faire :**
- Dans le listener Realtime de `useRoomSession`, matcher le message entrant sur `senderUserId + text` pour remplacer l'optimiste
- Ajouter un timeout de nettoyage : si l'optimiste n'est pas remplacé sous 5s, le supprimer
- Tester le cas multi-utilisateurs simultanés (deux users qui envoient en même temps)

---

## PARTIE 2 — Fonctionnalités manquantes à implémenter

### 2.1 Indicateur de frappe ("X is typing...")

**Priorité : HAUTE**

Le composant affiche déjà `typingMembers` mais ce state n'est jamais alimenté par des données réelles.

**À faire :**
- Utiliser le **Supabase Realtime Presence** pour broadcaster l'état de frappe
- Quand un user tape dans `ChatInput`, envoyer un event `typing: true` via `channel.track()`
- Arrêter l'event après 2s d'inactivité (debounce)
- Côté réception : lire `presenceState()` et extraire les users avec `typing: true` différents de soi
- Afficher leurs noms dans `typingMembers`

**Fichiers concernés :** `StudyRoomShell.tsx`, `useRoomSession.ts` (ajouter channel presence)

---

### 2.2 Résolution du nom affiché pour les messages reçus

**Priorité : HAUTE**

Actuellement, les messages des autres membres affichent "Teammate" si leur `userId` n'est pas trouvé dans `liveParticipants` (race condition possible au chargement).

**À faire :**
- S'assurer que les participants sont chargés **avant** l'affichage des messages (ou afficher un skeleton)
- Si un `senderUserId` n'est pas dans `liveParticipants`, faire un fetch ponctuel `users.select('display_name').eq('id', senderUserId)`
- Mettre en cache les noms résolus dans un `Map<userId, displayName>` pour éviter les requêtes répétées

---

### 2.3 Gestion de la déconnexion / reconnexion Realtime

**Priorité : HAUTE**

Si un utilisateur perd sa connexion réseau, les channels Supabase Realtime se déconnectent. À la reconnexion, les messages envoyés pendant la coupure ne sont pas chargés.

**À faire :**
- Écouter l'événement `CHANNEL_ERROR` et `CLOSED` sur les channels
- À la reconnexion, recharger les messages depuis la dernière date connue (`timestamp > lastMessage.timestamp`)
- Afficher un indicateur visuel "Reconnexion en cours..." dans le header de la room
- Implémenter un exponential backoff pour les tentatives de reconnexion

---

### 2.4 `online_count` fiable

**Priorité : MOYENNE**

Le compteur `online_count` sur `study_rooms` est actuellement mis à jour via deux mécanismes qui peuvent se désynchroniser :
1. RPC `increment_room_online_count` / `decrement_room_online_count`
2. `syncRoomOnlineCount` basé sur la presence Supabase

**À faire :**
- Choisir une source de vérité unique : **la presence Supabase** est plus fiable car elle gère les déconnexions imprévues
- Remplacer les RPC increment/decrement par un update périodique depuis le count de presence (déjà partiellement en place via `syncRoomOnlineCount`)
- Ou : calculer `online_count` dynamiquement depuis `study_room_participants` via une vue ou une fonction

---

### 2.5 Nettoyage des participants à la déconnexion

**Priorité : MOYENNE**

Si un utilisateur ferme l'onglet ou perd la connexion brutalement, sa ligne dans `study_room_participants` reste présente indéfiniment.

**À faire :**
- Ajouter une colonne `last_seen_at timestamptz` sur `study_room_participants`
- Mettre à jour `last_seen_at` via la presence Supabase (à chaque `sync`)
- Créer une Edge Function ou un cron Supabase qui supprime les participants avec `last_seen_at < now() - interval '2 minutes'`
- Alternativement : utiliser uniquement la presence Supabase pour la liste "en ligne" et `study_room_participants` uniquement pour les droits d'accès

---

### 2.6 Messages de system événements (join/leave) en temps réel

**Priorité : MOYENNE**

Quand un membre rejoint ou quitte la room, les autres devraient voir un message système automatique ("Alice a rejoint la room").

**À faire :**
- Dans le listener `study_room_participants INSERT` de `useRoomSession`, injecter un `RoomEvent` de type `system` dans `roomMessages`
- Pareil pour `DELETE` : "Bob a quitté la room"
- Ne pas émettre cet event pour soi-même (comparer avec `currentDbUserId`)

---

### 2.7 Limite de 8 membres — UX claire

**Priorité : MOYENNE**

La logique existe côté DB (RPC `join_study_room` retourne une erreur `ROOM_FULL`), mais l'UX n'est pas complète.

**À faire :**
- Afficher clairement dans la liste des rooms qu'une room est pleine (`onlineCount >= maxMembers`)
- Désactiver le bouton "Rejoindre" si pleine
- Le message d'erreur `RoomJoinError` est déjà géré dans `useStudyRooms`, vérifier qu'il s'affiche proprement

---

### 2.8 Support des fichiers dans les messages de room

**Priorité : BASSE**

L'upload de fichiers dans `ChatInput` crée des blob URLs locaux qui ne sont pas partagés avec les autres membres.

**À faire :**
- Uploader le fichier sur Supabase Storage (`room-files` bucket) avant l'envoi du message
- Stocker la référence dans `room_files` (table déjà existante)
- Inclure l'URL publique dans le message ou le lier via `attached_files`
- Afficher les fichiers dans `RoomMessageBubble` côté réception

---

### 2.9 Mode passif / actif — broadcast aux autres membres

**Priorité : BASSE**

Quand le créateur change le mode IA (`passive` / `active`), seul lui voit le message système. Les autres membres n'en sont pas informés.

**À faire :**
- Persister le changement de mode dans `study_rooms.ai_mode` via un update Supabase
- Le changement transitera automatiquement via le Realtime `study_rooms` déjà en place dans `useStudyRooms`
- Les membres recevront le nouveau mode et pourront adapter leur UX
- Retirer le RPC `decrement_room_limit` factice et le lier au vrai changement en DB

---

## PARTIE 3 — Améliorations architecture

### 3.1 Centraliser `currentDbUserId` dans le contexte global

Actuellement `getDbUserId()` est un appel RPC qui peut être fait plusieurs fois. Il faut le résoudre une seule fois au login et le stocker dans un contexte React ou Zustand.

### 3.2 Séparer `StudyRoomShell` en sous-composants

Le composant fait ~1300 lignes. Extraire :
- `RoomHeader` — timer, infos room, membres
- `RoomFeed` — liste des messages
- `RoomInput` — ChatInput + quick actions + menus
- `RoomReport` — overlay fin de session

### 3.3 Typer strictement `RoomEvent` vs `RoomMessage`

`RoomEvent` (UI) et `RoomMessage` (DB) sont deux types distincts qui coexistent dans le même state `roomMessages`. Centraliser la conversion dans `roomMessageAdapter.ts` et ne jamais mélanger les deux dans le state.

---

## Résumé des priorités

| # | Tâche | Priorité | Effort |
|---|---|---|---|
| 1.1 | `currentDbUserId` dans les props | 🔴 CRITIQUE | S |
| 1.2 | `sender_user_id` dans l'API stream | 🔴 CRITIQUE | S |
| 1.3 | Déduplication messages streaming | 🔴 HAUTE | M |
| 2.1 | Indicateur de frappe (presence) | 🟠 HAUTE | M |
| 2.2 | Résolution noms messages reçus | 🟠 HAUTE | S |
| 2.3 | Reconnexion Realtime | 🟠 HAUTE | L |
| 2.4 | `online_count` fiable | 🟡 MOYENNE | M |
| 2.5 | Nettoyage participants déco | 🟡 MOYENNE | M |
| 2.6 | Events join/leave système | 🟡 MOYENNE | S |
| 2.7 | UX room pleine | 🟡 MOYENNE | S |
| 2.8 | Fichiers partagés dans messages | 🟢 BASSE | L |
| 2.9 | Broadcast changement mode IA | 🟢 BASSE | M |

**Effort :** S = < 1h, M = 2-4h, L = demi-journée+
