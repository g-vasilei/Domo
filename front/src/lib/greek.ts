// Translate known API messages for display; preserve unknown diagnostics and device data.
const API_MESSAGES: Record<string, string> = {
  'Invalid credentials': 'Μη έγκυρα στοιχεία σύνδεσης.',
  'Invalid Tuya credentials': 'Τα στοιχεία σύνδεσης Tuya δεν είναι έγκυρα.',
  'Tuya credentials not configured': 'Δεν έχουν οριστεί στοιχεία σύνδεσης Tuya.',
  'Current password is incorrect': 'Ο τρέχων κωδικός δεν είναι σωστός.',
  'Cannot change password for OAuth accounts':
    'Η σύνδεση αυτού του λογαριασμού γίνεται μέσω Google.',
  'A user with this email already exists': 'Υπάρχει ήδη χρήστης με αυτό το email.',
  'Account already exists for this email': 'Υπάρχει ήδη λογαριασμός με αυτό το email.',
  'Only owners can invite members': 'Μόνο ο ιδιοκτήτης μπορεί να προσκαλεί μέλη.',
  'Invalid invitation token': 'Η πρόσκληση δεν είναι έγκυρη.',
  'Invitation already used': 'Η πρόσκληση έχει ήδη χρησιμοποιηθεί.',
  'Invitation has expired': 'Η πρόσκληση έχει λήξει.',
  'Invalid PIN': 'Το PIN δεν είναι σωστό.',
  'PIN required': 'Απαιτείται PIN.',
  'Current PIN required to change PIN': 'Εισαγάγετε το τρέχον PIN για να το αλλάξετε.',
  'Current PIN is incorrect': 'Το τρέχον PIN δεν είναι σωστό.',
  'Cannot arm while in an active alarm state':
    'Δεν είναι δυνατή η όπλιση όσο ο συναγερμός είναι ενεργοποιημένος.',
  'No permission for this device action': 'Δεν έχετε δικαίωμα για αυτή την ενέργεια στη συσκευή.',
  'No permission to manage automations': 'Δεν έχετε δικαίωμα διαχείρισης αυτοματισμών.',
  'Duration must be between 1 and 1440 minutes': 'Η διάρκεια πρέπει να είναι από 1 έως 1440 λεπτά.',
  'Device does not expose this power switch': 'Η συσκευή δεν υποστηρίζει αυτόν τον διακόπτη.',
  'Device rejected command': 'Η συσκευή δεν αποδέχτηκε την εντολή.',
  'Enter a schedule name': 'Εισαγάγετε όνομα προγράμματος.',
  'Invalid timezone': 'Η ζώνη ώρας δεν είναι έγκυρη.',
  'Each start time must be unique': 'Κάθε κανόνας πρέπει να έχει διαφορετική ώρα έναρξης.',
  'Schedule not found': 'Το πρόγραμμα δεν βρέθηκε.',
  'Rule not found': 'Ο κανόνας δεν βρέθηκε.',
  'Event not found': 'Το συμβάν δεν βρέθηκε.',
  'User not found': 'Ο χρήστης δεν βρέθηκε.',
  Forbidden: 'Δεν έχετε δικαίωμα πρόσβασης.',
  Unauthorized: 'Απαιτείται σύνδεση στον λογαριασμό.',
};

export function localizeApiMessage(message: unknown): unknown {
  if (Array.isArray(message)) return message.map(localizeApiMessage);
  if (typeof message !== 'string') return message;
  return API_MESSAGES[message] ?? message;
}
