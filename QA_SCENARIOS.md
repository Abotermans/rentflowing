# Parcours QA locatif

Derniere execution : 15/10/2026, portefeuille isole `QA-20261015` sur la preview locale.
Ces donnees de test restent en place pour permettre une verification manuelle. Le portefeuille `Demo` a ensuite ete nettoye de ses doublons de creances, avec accord explicite de l'utilisateur.

## Jeu de donnees

- Bien `QA-BRU-001` : Residence QA Octobre, Bruxelles, EUR, base 1000.
- Unites `QA-A01` (appartement, 1200 EUR de loyer, 150 EUR de charges, 400/1000), `QA-P01` et `QA-P02` (parkings crees en lot, 80 + 10 EUR chacun, 50/1000).
- Locataire `Camille Essai` ; bail `QA-LEASE-001` sur `QA-A01` + `QA-P01`, du 01/10/2026 au 30/09/2027.
- Garantie 2560 EUR, encaissement 1440 EUR, avenants `QA-AV-001` a `QA-AV-003`. `QA-AV-001` est un artefact du defaut d'enregistrement constate puis corrige ; il n'a pas de changement attache.
- Bail brouillon `QA-INDEX-001` sur `QA-A01` du 01/10/2027 au 30/09/2028, utilise pour tester la persistance de l'indexation sans modifier les loyers courants.
- Avenant actif `QA-INDEX-AV-001` sur `QA-LEASE-001` : indices 100 -> 110 avec plafond de 5 %, date de base du 15/10/2025 et date d'effet du 15/10/2026.

## Resultats observes

| Parcours | Resultat | Controle |
| --- | --- | --- |
| Creer un bien et recharger | OK | `QA-BRU-001` et ses parametres restent visibles. |
| Valider les champs obligatoires du bien | OK | Erreurs affichees sous les champs ; pas d'enregistrement. |
| Creer une unite, puis deux parkings en lot | OK | Trois unites presentes apres rechargement. |
| Modifier les milliemes et la date de disponibilite | OK avec reserve de revalidation | La capacite totale reste <= 1000. Le plafonnement silencieux a ete retire dans le code ; verifier dans la preview qu'une valeur trop haute reste visible et affiche l'erreur sous le champ. |
| Creer un locataire | OK | `Camille Essai` persiste et passe de candidat a actif avec son bail actif. |
| Naviguer entre les trois etapes du bail | OK | Les donnees saisies sont conservees. |
| Creer un bail brouillon multi-unites | OK apres correctif | Le bail et ses deux affectations persistent ; aucune creance en brouillon. |
| Passer en attente de signature, puis signer manuellement | OK | La confirmation sans contrat initial signe apparait ; une date apres le debut du bail est refusee. |
| Generer et regler la premiere echeance | OK | Loyer 1280 EUR + charges 160 EUR, affectes et payes ; solde 0 EUR apres rechargement. |
| Enregistrer une garantie | OK | 2560 EUR recus, date de reception conservee. |
| Activer un avenant de loyer/charges | OK apres correctif | `QA-AV-003` applique 1400 + 170 EUR a l'appartement ; total courant du bail 1660 EUR avec le parking. L'echeance payee avant la date d'effet reste a 1440 EUR. |
| Afficher l'occupation et le rendement de l'unite | OK apres correctif | Une ligne par bail ; part de l'appartement 1570 EUR ; perte sur vacance 0 EUR avant sa date de disponibilite. |
| Synchroniser le statut stocke de l'unite | OK, action manuelle requise | Apres activation, l'unite affichait "Occupe" mais restait stockee "Vacant" ; le bouton de synchronisation a supprime l'alerte. L'automatisation de cette synchronisation reste a arbitrer. |
| Bloquer un bail chevauchant | OK | Conflit explicite du 01/12/2026 au 30/11/2027 ; aucun conflit du 01/10/2027 au 30/09/2028. |
| Activer l'indexation sur un bail | OK | Migration `20260811130000_lease_indexation.sql` appliquee via Lovable Cloud. `QA-INDEX-001` conserve l'indexation active avec indices 100 -> 100 apres rechargement. L'avenant `QA-INDEX-AV-001` applique 5 % de hausse plafonnee : creance de loyer du 01/11/2026 a 1554 EUR sur 1480 EUR de base, charges a 180 EUR. Les creances payees du 01/10/2026 restent a 1280 + 160 EUR. Le delai de creation des creances a ete porte temporairement a 30 jours pour exposer novembre, puis remis a 15 jours. |
| Confirmer un avenant d'indexation | OK apres correctif | Le dialogue affiche maintenant les indices, la date de base et le plafond avant/apres, au lieu d'indiquer a tort qu'aucune modification n'est prevue. Controle en apercu sans enregistrer de second avenant. |
| Nettoyer les donnees existantes de `Demo` | OK | 74 creances d'echeancier ouvertes, sans affectation et strictement identiques ont ete supprimees apres confirmation. `Demo` passe de 485 a 411 creances apres rechargement ; ses 28 affectations restent presentes. La base ne contient plus de doublon de creneau d'echeance. Le declencheur de `20261015120000_prevent_duplicate_lease_receivables.sql` est applique pour prevenir leur recreation. |
| Refuser une quote-part excessive a la creation d'une unite | OK dans la preview locale le 07/11/2026 | Sur `Residence du Parc`, 210/1000 a ete refuse quand le maximum disponible etait 209,01/1000. Le formulaire est reste ouvert, l'erreur explique la limite sous le champ, les erreurs des champs deja corriges ont disparu, et aucune unite `QA-OVER-TEST` n'a ete creee. Aucun enregistrement n'a ete tente sur une valeur valide. |
| Refuser une quote-part excessive en creation groupee | OK dans la preview locale le 07/11/2026 | Cinq unites a 50/1000 chacune ont ete refusees : le maximum affiche etait 41,8/1000 par unite. Le formulaire est reste ouvert avec une erreur sous le champ ; aucune unite `QA-OVER-` n'a ete creee. |
| Refuser une garantie incoherente | OK dans la preview locale le 07/11/2026 | Sur `BAIL-PAR-001`, montant attendu negatif, retenue sans date de restitution et retenue superieure au montant recu sont refuses sous les champs. Une date de restitution anterieure a la reception affiche maintenant son erreur sous la date ; l'erreur disparait apres correction. Dialogue annule sans modifier la garantie. |
| Refuser une quote-part excessive en edition d'unite | OK dans la preview locale le 07/11/2026 | Sur `PAR-P01`, la saisie 1000/1000 reste visible quand le maximum de l'unite est 232/1000. Le champ est invalide avec explication dessous ; enregistrer ne ferme pas le dialogue. L'erreur disparait apres retour a 22,99/1000 ; dialogue annule sans modifier l'unite. |
| Valider les autres champs en edition d'unite | OK dans la preview locale le 07/11/2026 | Sur `PAR-P01`, quote-part -1, code vide, code `PAR-A02` deja utilise, surface 0 et chambres -1 sont refuses avec erreur sous le champ. Le dialogue reste ouvert et a ete annule sans enregistrement. |

## Scenarios a poursuivre

- Edition puis suppression controlee d'un bien, d'une unite libre et d'un bail brouillon ; refus de supprimer un objet encore reference.
- Avenant planifie, ajout/retrait d'unite, changement de formule de loyer, recalcul des creances futures et conservation des creances deja affectees.
- Bail actif sans date de fin : sauvegarde puis rechargement sans fin, creation
  des echeances mensuelles suivantes, et formule de six mois sans cycle
  artificiellement raccourci. Appliquer d'abord la migration de date de fin.
- Creation d'un bail actif sur un bien en fuseau `Europe/London` par un
  gestionnaire en `Europe/Brussels` autour de minuit : l'echeance du jour du
  bien doit rester ouverte, les echeances anterieures seules sont historisees
  comme payees, et le nombre annonce dans la premiere etape doit correspondre
  aux lignes effectivement enregistrees apres rechargement.
- Contrat initial signe, unicite du contrat, suppression/declassement avant la date de debut.
- Apres sauvegarde restaurable et migrations, verifier que les deux anciens
  documents de `Demo` gardent leur type (`amendment` et `id`) apres rechargement.
  Creer un type personnalise, ajouter un document de ce type, recharger et
  confirmer que le type et le fichier persistent ; aucune etape de signature
  ne doit apparaitre. Verifier l'import d'un ancien type local et son libelle.
  Tenter de retirer un type utilise : le refus doit lister le document et le
  bail. Verifier aussi qu'un upload sur un schema incomplet echoue clairement
  sans creer de ligne `supporting` a la place ni laisser un fichier orphelin.
- Paiement partiel, paiement excessif, affectation manuelle, annulation et rapprochement dans les rapports.
- Affectation automatique d'un encaissement insuffisant avec un loyer en
  retard et des charges plus anciennes sur le meme bail : le loyer doit etre
  servi en premier, puis les charges, meme si leur date est beaucoup plus
  ancienne. Verifier les soldes apres rechargement.
- Retour operationnel d'une unite vacante disponible pendant 15 jours d'un
  mois de 30 jours, avec loyer de base 1 000,29 : le loyer theorique et la
  perte de vacance doivent etre de 500,15 pour l'unite et le bien.
- Saisir un encaissement et un paiement rapide avec une virgule decimale :
  `0,30` doit etre accepte, tandis que `0,301`, zero et une valeur vide
  affichent leur raison sous le montant. Verifier que 0,30 affecte 0,10 et
  0,20 sans reliquat ni fraction de centime, et que deux clics rapides ne
  creent pas deux encaissements. Tester aussi le refus d'un montant sub-centime
  envoye directement a l'API.
- Encaissement remboursé, annulé ou en erreur avec un ancien solde non affecté :
  ne proposer aucune affectation manuelle ou automatique, ne pas l'afficher
  comme crédit disponible, et conserver une erreur explicite si une ancienne
  fenêtre tente tout de même de l'affecter. Pour un locataire ayant EUR et GBP,
  ne jamais additionner les deux crédits dans un montant unique. Sur une fiche
  bail, exclure aussi un encaissement non affecté déjà lié à un autre bail.
- Creance de loyer ou charges annulee, passee en perte ou contestee : verifier
  que les montants annules ne gonflent ni le rendement ni les soldes ouverts,
  que les montants passes en perte ne sont plus recouvrables mais restent
  visibles comme loyers factures impayes, et que la creance contestee reste
  identifiable dans chaque ecran. Controler les dates d'echeance dans deux
  fuseaux de biens autour de minuit.
- Recu lie au bail A avec deux creances de meme devise sur le meme bien :
  verifier que la creance du locataire du bail B reste intacte, y compris en
  affectation automatique et dans la liste des affectations manuelles.
- Locataire ayant des creances de meme devise sur deux biens : un encaissement
  explicitement lie au bien A ne doit solder que les creances du bien A,
  meme sans bail selectionne. Un encaissement sans bien peut couvrir les deux
  biens. Controler l'affectation manuelle, automatique, le surplus d'un
  paiement rapide et le refus cote base.
- Bail avec creances EUR et GBP : verifier que le detail du bail, la liste des
  baux et le tableau de bord affichent les montants et retards par devise,
  sans les additionner ni les presenter comme la devise du bien. Les rendements
  du bien et de ses unites doivent afficher l'alerte de devise pour la periode
  touchee, puis redevenir disponibles pour une periode sans ecriture discordante.
- Preavis, sortie, retenue/restitution de garantie, fin et resiliation du bail.
- Garantie : le formulaire conserve et refuse localement les valeurs non numeriques
  ou de precision inferieure au centime, avec erreur sous le champ (tests locaux
  du 07/11/2026). Verifier encore dans la preview authentifiee le refus
  d'enregistrement sur une nouvelle garantie et sa persistance apres rechargement.
  Les autres erreurs ont ete confirmees dans la preview le 07/11/2026 sans
  modifier la garantie existante.
- Garantie en base : verifier sur une copie restaurable que les anciennes lignes
  restent lisibles, que les deux audits de montant/statut n'ont aucun resultat
  inattendu et qu'une insertion directe sous-centime, negative ou avec retenue
  superieure au montant recu est refusee. La migration locale n'est pas encore
  appliquee au projet Lovable.
- Garantie unique : executer le controle read-only `duplicate_lease_guarantees`.
  Si non nul, consulter `scripts/audit-duplicate-guarantees.sql` et decider
  ligne par ligne avant la migration d'unicite. Verifier ensuite qu'une seconde
  garantie pour le meme bail est refusee, meme en cas de deux creations
  concurrentes, sans supprimer la garantie d'origine.
- Autres cas d'indexation : baisse d'indice, differents arrondis, anniversaires ulterieurs et creances futures deja affectees. La hausse plafonnee et son effet prospectif ont ete verifies en base et dans l'interface.
- Desactiver l'indexation par avenant, recharger et confirmer que les anciens
  indices, la date de base et le plafond restent effaces ; consulter les
  conditions avant et apres l'avenant, puis reactiver l'indexation. La
  persistance des valeurs nulles et l'historique ont des tests locaux, mais
  ce parcours reste a verifier sur le backend cible.
- Appliquer un avenant d'indexation seul au milieu d'un mois : les creances
  futures gardent les periodes et dates d'echeance du bail initial, tandis que
  seuls leurs montants changent. Un test local couvre les periodes mensuelles ;
  refaire le controle avec des creances deja affectees dans la preview cible.
- Avenant ramenant le loyer et/ou les charges d'une unite a zero : confirmer
  les montants du bail enregistres, les creances futures et le retour a
  l'historique du contrat initial apres rechargement. Avec deux avenants
  successifs, verifier les anciennes valeurs de garantie, formule, locataires
  et date de fin aux dates anterieures a chaque avenant.
- Tester l'activation d'un avenant et les statuts du bail autour de minuit
  dans le fuseau du bien, notamment lors des passages heure d'ete/hiver et
  depuis un navigateur situe dans un autre fuseau europeen. Un bail sans date
  de fin doit rester actif et ne jamais apparaitre en fin depassee.
- Apres la migration de rattrapage du cycle de vie et l'installation du job :
  avec tous les navigateurs fermes, faire passer un bail signe a actif a sa
  date de debut, puis un bail actif a termine apres sa date de fin. Verifier
  l'historique, les avenants actifs, les statuts de chaque locataire et le
  rapport locatif apres rechargement. Rejouer le job sans creer de doublon,
  verifier le refus pour un utilisateur client, puis tester une erreur
  d'ecriture de l'historique sans changement partiel.
- Filtrer les baux en fin proche et ouvrir le rapport d'expiration : exclure
  une fin deja passee, inclure une fin aujourd'hui et exactement au dernier
  jour de la plage choisie, exclure les baux sans fin. Laisser l'onglet ouvert
  apres minuit local et verifier que filtres, nombres de jours restants,
  impayes et tableau de bord se rafraichissent sans rechargement. Refaire le
  controle au passage heure d'ete/hiver.
- Allocation des couts, propriete partielle, amortissement et coherence des rendements unite/bien pour plusieurs devises.
- Sur un bien configure en GBP, enregistrer une charge active en EUR, une taxe
  active en GBP, puis annuler une autre charge qui avait deja des lignes de
  repartition. La fiche du bien et la vue des repartitions doivent afficher
  EUR et GBP separement, exclure la charge annulee et ses anciennes lignes,
  et faire correspondre les totaux des unites aux montants actifs repartis.
- Sur la fiche d'une unite de ce bien, verifier que chaque ligne et son
  infobulle utilisent la devise de la facture, que le pied de tableau separe
  EUR/GBP et qu'une charge directe partiellement recuperable figure dans les
  deux compteurs selon son pourcentage. Annuler une ecriture puis recharger :
  elle et ses anciennes repartitions ne doivent plus gonfler les compteurs.
- Bien partiellement detenu avec cles `general` et `elevator` differentes :
  en mode milliemes normalise, calculer d'abord le cout gere avec la somme des
  quotes-parts `general`, puis le repartir selon `elevator`. Verifier que le
  total des unites egale le cout effectif du bien et que l'infobulle explique
  ces deux bases distinctes. En mode absolu, verifier la part de facture
  calculee directement avec la cle `elevator`.
- Regle "unites occupees uniquement" : enregistrer un cout date d'un ancien bail
  termine alors que l'unite est maintenant vacante ; elle doit recevoir sa part.
  Une unite occupee aujourd'hui mais sans affectation a la date du cout doit
  rester exclue. Le calcul utilise le debut de l'ecriture comme date de
  reference ; verifier explicitement la regle metier pour un cout couvrant
  plusieurs changements d'occupant.
- Ecriture partiellement recuperable : refuser un pourcentage absent, nul ou
  egal a 100 ; enregistrer 30 %, recharger, puis verifier que la repartition,
  le rendement unite/bien et la reconciliation du bail conservent 30 % a
  recuperer et 70 % a charge du proprietaire. Verifier apres migration qu'une
  ancienne ecriture partielle conserve son partage historique de 50 %.
- Bail avec une unite initiale puis une seconde ajoutee par avenant : creer
  des couts recuperables directs et repartis sur les deux unites. La
  previsualisation et l'enregistrement de la regularisation doivent compter
  les deux parts une seule fois et afficher l'unite de chaque ligne. Si le
  depart effectif est posterieur a la fin du bail, le calcul s'arrete a la
  fin du bail ; s'il est anterieur, il s'arrete au depart effectif.
- Regulariser les charges de janvier, encaisser l'ajustement en fevrier,
  puis preparer la regularisation de fevrier. La provision encaissee de
  fevrier doit inclure uniquement les creances de charges ordinaires de
  fevrier, pas l'ajustement de janvier, meme si celui-ci est paye en fevrier.
- Apres la migration atomique des couts : creer puis modifier une ecriture
  repartie, recharger et verifier que le cout et toutes ses lignes de
  repartition changent ensemble. Provoquer une erreur sur une ligne : rien ne
  doit changer. Deux sessions qui modifient la meme ecriture doivent produire
  un refus de version perimee, sans ecraser silencieusement le premier edit.
  Le role lecteur ne doit pas pouvoir appeler la fonction directement.
- Apres la migration atomique des paiements : creer un encaissement avec
  repartition automatique, puis repartir manuellement le solde. Tester le
  paiement rapide, une creance dans une autre devise, deux onglets qui
  modifient la meme creance ou le meme encaissement, et une repartition
  rejetee en base. Recharger apres chaque operation : encaissement, solde de
  creance et lignes de repartition doivent avancer ensemble ou ne pas changer
  du tout. Un lecteur ne doit pas pouvoir appeler la fonction directement.
- Apres la migration atomique de creation des baux : creer un bail avec deux
  unites et des creances generees, puis recharger et verifier aussi le statut
  du locataire. Provoquer une erreur sur une creance et une version locataire
  perimee : aucun des quatre ensembles de lignes ne doit changer. Deux
  sessions tentant de reserver la meme unite sur des dates qui se chevauchent
  doivent produire un seul succes ; des dates qui se touchent restent admises.
  Verifier le message de conflit et le refus pour le role lecteur.
- Apres `20261018030000_atomic_lease_tenant_update.sql` : modifier un bail et
  son statut de cycle de vie, puis recharger pour confirmer le bail et le
  statut des locataires. Depuis deux sessions, une version de bail ou de
  locataire perimee doit refuser toute la transaction ; un lecteur ne doit
  pas pouvoir l'appeler. La suite locale couvre ces cas, a confirmer sur le
  backend cible.
- Apres la migration atomique des regles de repartition : creer une regle
  manuelle avec deux unites totalisant 100 %, modifier ses parts, puis passer
  a une methode non manuelle et verifier que les anciennes parts disparaissent.
  Provoquer une erreur sur une part, une unite d'un autre bien et une version
  perimee : regle et parts doivent rester identiques apres rechargement.
  Verifier le refus direct de la fonction pour le role lecteur.
- Apres la migration atomique des regularisations de charges : creer une
  regularisation avec montant du et une autre avec remboursement, puis
  recharger pour verifier que chaque regularisation a exactement sa creance
  d'ajustement. Tester aussi « aucune action » sans creance. Tenter une
  regularisation incoherente, une periode deja regularisee et un echec de la
  deuxieme insertion : aucune creance orpheline ne doit rester. Supprimer une
  regularisation non payee, puis refuser la suppression d'une regularisation
  dont la creance a une affectation. Verifier les versions perimees et le role
  lecteur.
- Apres la migration atomique des avenants : creer deux avenants pour un meme
  bail depuis deux sessions et verifier des numeros distincts apres
  rechargement. Modifier un brouillon avec plusieurs lignes, puis provoquer
  une erreur sur une ligne : le parent et les lignes anterieures doivent
  rester intacts. Tester une version perimee, le refus de modifier un avenant
  deja actif et le refus direct de la fonction pour un lecteur. Tester
  l'activation separement avec `20261018020000_atomic_amendment_activation.sql` :
  le bail, les affectations, les statuts d'avenants, les creances futures et
  les statuts locataires doivent changer ensemble. Une erreur sur une nouvelle
  creance, un bail ou une affectation perimee, une creance deja payee ou un
  lecteur doivent refuser toute la transaction. La suite locale couvre le
  succes, une affectation modifiee, un bail perime, l'annulation sur ligne
  invalide et le refus d'un lecteur ; confirmer sur le backend cible.
- Sur le backend cible, faire avancer automatiquement deux baux du meme
  locataire dans deux fuseaux horaires differents. Verifier « signe -> actif »
  puis « actif -> termine » : le locataire reste actif tant qu'un bail est
  actif, devient ancien apres le dernier, et chaque transition n'apparait
  qu'une seule fois dans l'historique meme si la tache est relancee.
- Ouvrir la synthese des repartitions avec au moins un bien EUR et un bien GBP :
  chaque ligne de cout et chaque ligne d'unite doit afficher la devise de son
  bien, sans somme ni conversion entre les deux devises.
- Invitation d'un nouvel utilisateur : apercu du lien avant connexion,
  acceptation avec le bon compte, refus avec un autre e-mail, expiration,
  invitation revoquee, compte deja membre et double clic. La nouvelle RPC transactionnelle doit
  etre appliquee sur le backend avant ces essais. Un compte non confirme doit
  etre refuse sans consommer l'invitation, puis pouvoir l'accepter apres
  confirmation. L'ajout direct d'un compte deja membre doit etre refuse sans
  changer son role ; un nouveau compte passe par une invitation. Afficher les
  adresses des membres pour un proprietaire ou administrateur, mais jamais
  celles d'un autre portefeuille ni pour un lecteur. Changer de portefeuille
  pendant un chargement lent ne doit pas montrer l'ancienne liste. Simuler une
  reponse perdue apres acceptation : relire l'appartenance du compte connecte
  et rejoindre le portefeuille uniquement si cette appartenance est confirmee.
  Une reponse renvoyant l'identifiant d'un autre portefeuille, ou une relecture
  impossible, ne doit pas afficher un succes.
- Creation d'un portefeuille : sous un compte connecte, simuler une reponse
  perdue apres l'insertion, puis reessayer sans fermer la fenetre. Verifier
  qu'un seul portefeuille existe, avec le nom attendu et le createur comme
  membre proprietaire. Si la liste des portefeuilles ne se recharge pas apres
  une creation confirmee, afficher « cree mais liste indisponible » sans
  proposer de refaire l'insertion. Refaire ce test sur le backend cible avec
  le declencheur d'appartenance effectivement deploye.
- Isolation entre portefeuilles apres migration : un editeur du portefeuille A
  peut creer et modifier une affectation, une creance, un encaissement, une
  repartition, un cout et un document lies a A, mais ne peut jamais y placer
  l'identifiant d'un parent du portefeuille B. Verifier aussi les references
  facultatives lors de leur ajout par UPDATE et les refus pour un non-membre.
- Membres : deux proprietaires qui tentent simultanement de quitter ou d'etre
  retires ne peuvent pas laisser un portefeuille sans proprietaire ; la
  suppression explicite du portefeuille par un proprietaire autorise reste
  possible et supprime ses appartenances par cascade.
- Role lecteur : parcourir biens, unites, locataires, prestataires, baux et
  paiements sans voir de commandes de creation, modification, suppression ou
  activation. Un lien direct vers une edition ne doit pas ouvrir le formulaire.
  Verifier aussi qu'aucune generation automatique de creances ou activation
  d'avenant ne part pendant cette session, puis confirmer les refus RLS en base.
- Bail termine avant sa fin contractuelle : ouvrir `BAIL-PAR-001` et
  `BAIL-BRU-001`, recharger et verifier que le statut reste `Termine`, que la
  date de depart effectif reste le 11/06/2026 et que l'affectation de l'unite
  s'arrete a cette date. `BAIL-PAR-003` peut commencer le 01/07/2026 sur la
  meme unite sans chevauchement. Examiner separement `BAIL-AMS-001`, marque
  termine avec motif d'expiration naturelle avant sa fin contractuelle et
  sans date de depart effectif : aucune correction des donnees n'est deduite
  automatiquement de cette seule anomalie.
- Sur `BAIL-PAR-001`, rapprocher le loyer du bail (1 350 GBP) et celui de son
  affectation historique (120 GBP, charges 0). Le tableau de synthese doit
  afficher la valeur enregistree sur l'affectation, mais la source de l'ecart
  contractuel doit etre decidee avant toute correction des donnees. Les
  creances EUR payees du logement `PAR-A01` n'ont pas d'affectation de bail
  correspondante. Verifier le contrat et les justificatifs avant de restaurer
  une affectation, et ne pas convertir ni reattribuer ces paiements par
  supposition. Utiliser `scripts/audit-lease-main-assignments.sql` pour
  examiner tous les baux sans unite principale.
- Bail multi-unites : sur `BAIL-PAR-003`, ouvrir le rendement de `PAR-P01`
  puis de `PAR-A01`. Un echeancier unique et coherent peut etre ventile pour
  le reporting selon les parts contractuelles, sans modifier sa creance.
  En revanche, les cycles dupliques sur plusieurs unites avec le montant total
  du bail doivent masquer le rendement par unite et afficher une alerte. Sur
  `BAIL-PAR-001`, la seule part de parking (120 GBP) ne couvre pas le loyer du
  bail (1 350 GBP) : son rendement doit egalement rester indisponible. Le
  rendement global du bien ne prouve pas la repartition par unite.
  Sur `BAIL-BER-001`, rapprocher les 250 EUR de charges mensuelles avec les
  190 EUR de parts de charges actuellement affectees aux unites. Ne pas
  inventer les 60 EUR restants. Rejouer l'audit en lecture seule dans
  `scripts/audit-multiunit-receivable-attribution.sql` et valider les contrats
  et les deux creances payees de `QA-LEASE-001` avant toute conversion des
  donnees historiques.
- Rendement du bien : sur `Residence du Parc`, les deux loyers complets et les
  deux lignes de charges completes de juillet 2026 doivent afficher une alerte
  pour quatre creances de cycle incoherentes et masquer les indicateurs. Deux
  creances distinctes de 900 et 100 pour un loyer de 1 000 doivent au
  contraire laisser le rendement du bien et de chaque unite disponible.
- Formule modifiee par avenant : pour un bail mensuel passant a une formule de
  six mois le 01/04/2026, l'echeance de janvier garde son cycle mensuel et
  celle du 01/04 au 30/09 se repartit selon les parts des unites. Les deux
  lignes de 5 400 et 600 pour un loyer contractuel de 1 000 par mois ne
  doivent pas masquer le rendement du bien ou des unites.

Une compilation et la suite automatisable passent, mais ces scenarios restants ne doivent pas etre consideres valides avant execution reelle.

Avant la production, suivre `SCHEDULER.md` sur une copie restauree, puis sur le
backend cible : lancer le job avec l'application fermee, rejouer la meme date,
verifier les creances payees inchangees, les cycles d'avenant et le refus sans
secret. Un bail actif sans affectation doit etre signale par HTTP 409 et
repare avant l'activation quotidienne du job.

Sur la revision publiee, mesurer le chargement initial et l'interaction sur
un telephone de milieu de gamme avec connexion mobile : relever LCP, INP,
taille transferee et erreurs JavaScript sur connexion, tableau de bord et
baux. La baisse locale de taille du bundle ne remplace pas cette mesure.
