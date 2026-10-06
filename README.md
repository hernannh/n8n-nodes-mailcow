[![n8n-nodes-mailcow](https://raw.githubusercontent.com/hernannh/n8n-nodes-mailcow/main/assets/banner.png)](https://github.com/hernannh/n8n-nodes-mailcow)

# n8n-nodes-mailcow

n8n community nodes for [mailcow](https://mailcow.email), the dockerized mail server suite.
Manage domains, mailboxes, aliases, app passwords, DKIM keys, the quarantine and the Postfix
queue from your workflows, and start workflows when something new shows up.

The UI is in English with a Spanish translation (set `N8N_DEFAULT_LOCALE=es`).

This is an independent community project. It is not affiliated with or endorsed by mailcow or
The Infrastructure Company GmbH.

## Nodes

**Mailcow** (action node)

| Resource | Operations |
|---|---|
| Alias | create, delete, get, get many, update |
| App Password | create, delete, get many |
| DKIM Key | create, delete, get |
| Domain | create, delete, get, get many, update |
| Log | get (postfix, dovecot, rspamd history, netfilter, API, ACME, SOGo, watchdog, ...) |
| Mail Queue | get many, flush, delete all |
| Mailbox | create, delete, get, get many, update |
| Quarantine | get many, release, learn as ham and release, delete |
| Status | version, containers, vmail disk usage |

**Mailcow Trigger** (polling): new mailbox, new alias, new domain, new quarantined message.
mailcow has no webhooks, so the trigger compares the lists between polls. The first poll after
activation only records what already exists, it does not replay it.

## Credentials

1. In the mailcow admin UI open **System > Configuration > Access > API**.
2. Use the **Read-only** key if the workflows only read (the trigger needs nothing more), or the
   **Read/Write** key to make changes.
3. Add the public IP n8n connects from to **Allow API access from**.
4. In n8n create a **Mailcow API** credential with the web UI URL (`https://mail.example.com`)
   and the key.

## Things the node takes care of

mailcow's API has a few behaviours that are easy to trip over. The node handles them so the
workflow does not have to:

- **Errors with HTTP 200.** Write calls answer 200 even when mailcow refuses the change and put
  `type: "danger"` in the body. The node turns that into a node error with mailcow's message.
- **HTTPS only.** Over plain HTTP the API returns an HTML redirect instead of JSON. The node
  reports that explicitly instead of failing on a parse error.
- **Mailbox rate limit on create.** `add/mailbox` ignores the rate limit, so the node sets it with
  a second call when you give one.
- **App password field names.** The API expects `app_passwd`/`app_passwd2`; any other name gets a
  misleading `password_complexity` error.
- **Generated passwords.** Leave the password empty on Mailbox > Create or App Password > Create
  and the node generates one and returns it once as `generated_password`.

Two behaviours of mailcow itself are shown as warnings in the node:

- **Mailbox > Update > Send As Addresses** replaces the whole list.
- **Alias > Update > Destinations** makes mailcow rebuild who can send as that alias, and the
  mailboxes that could do it lose the permission.

## Reading and sending mail

This node uses the admin API, which does not touch message contents. Reading and sending go over
IMAP and SMTP with the nodes n8n already has:

| To | Use |
|---|---|
| Start a workflow when mail arrives | **Email Trigger (IMAP)** (built in) |
| Send mail | **Send Email** (built in, SMTP) |
| Move, flag, search or delete messages | **n8n-nodes-imap** (community) |

What this node adds is the credential for them: an app password limited to the protocols the
workflow needs, so the workflow never holds the user's real password and you can revoke it
without touching the mailbox.

1. **Mailcow > App Password > Create** for the mailbox, protocols **IMAP** and **SMTP**, password
   empty. Copy `generated_password` from the output: it is returned only once.
2. Create an **IMAP** credential (host `mail.example.com`, port `993`, SSL) and an **SMTP**
   credential (port `465` with SSL, or `587` with STARTTLS). User: the full mailbox address.
   Password: the app password.
3. Use them in Email Trigger (IMAP) and Send Email.

[`examples/mail-with-app-password.json`](examples/mail-with-app-password.json) is a ready-made
workflow (Workflows > Import from File): it creates the app password and forwards every new mail
of a support mailbox to an admin address. Send the notification outside the watched mailbox, or
it triggers the workflow again.

## Development

```bash
npm install --ignore-scripts
npm run lint
npm test
npm run build
```

Tested against mailcow `2026-09`.

## License

[MIT](LICENSE)

---

## En español

Nodos community de n8n para administrar un servidor **mailcow**: dominios, buzones, alias,
contraseñas de aplicación, claves DKIM, cuarentena, cola de Postfix y logs, más un trigger por
polling (buzón, alias o dominio nuevo, y mensaje nuevo en cuarentena). La interfaz se traduce al
español con `N8N_DEFAULT_LOCALE=es`.

Para la credencial, creá una API key en **Sistema > Configuración > Acceso > API** (solo lectura
alcanza para leer y para el trigger) y agregá la IP pública de tu n8n en "Permitir API desde".
La URL base tiene que ser `https://`.

Para leer o enviar correo usá los nodos **Email Trigger (IMAP)** y **Send Email** (SMTP) de n8n, o
el community **n8n-nodes-imap**: la API de administración no accede al contenido de los mensajes.
Lo que aporta este nodo es la credencial:

1. **Mailcow > App Password > Create** para el buzón, protocolos **IMAP** y **SMTP**, sin password.
   Copiá `generated_password` de la salida: aparece una sola vez.
2. Creá una credencial **IMAP** (host `mail.tudominio`, puerto `993`, SSL) y una **SMTP** (puerto
   `465` con SSL, o `587` con STARTTLS). Usuario: la dirección completa del buzón. Password: la
   contraseña de aplicación.
3. Usalas en Email Trigger (IMAP) y Send Email.

El workflow de ejemplo [`examples/mail-with-app-password.json`](examples/mail-with-app-password.json)
crea la contraseña de aplicación y reenvía cada mail nuevo de un buzón de soporte a un admin. El
aviso tiene que ir a otra dirección, o vuelve a disparar el workflow.

Proyecto independiente de la comunidad, sin relación oficial con mailcow.
