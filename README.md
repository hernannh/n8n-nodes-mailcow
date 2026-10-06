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

This node uses the admin API, which does not touch message contents. To read or send mail from
a mailcow mailbox use the built-in **Email Trigger (IMAP)** and **Send Email** (SMTP) nodes, or
the community **n8n-nodes-imap** node. An app password with only the protocols the workflow
needs is a good fit for those credentials (App Password > Create).

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

Para leer o enviar correo usá los nodos IMAP/SMTP de n8n con una contraseña de aplicación: la API
de administración no accede al contenido de los mensajes.

Proyecto independiente de la comunidad, sin relación oficial con mailcow.
