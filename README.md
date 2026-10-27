# iCampus Admin

The standalone web portal for iCampus administrators. It is an Expo application
that targets the web and connects to the same backend as the iCampus mobile app.

## Requirements

- Node.js 20 or newer
- npm
- An iCampus backend URL

## Local development

1. Install dependencies:

   ```sh
   npm install
   ```

2. Set `EXPO_PUBLIC_BACKEND_URL` in `.env` to the same backend URL configured for
   the iCampus app. `.env.example` is provided as a template. Do not commit `.env`.

3. Start the website:

   ```sh
   npm run web
   ```

   Expo prints a local URL when the web server is ready.

## Expo hosting

Link this app to an Expo project (this updates `app.json` with the project ID),
then deploy the web build with EAS Hosting:

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest deploy --prod
```

Configure `EXPO_PUBLIC_BACKEND_URL` in the EAS environment for the deployment
environment before building/deploying. This variable is embedded in the
client-side website and must contain only the public backend base URL, never a
secret. Configure the backend to allow requests from the deployed website's
origin if its CORS policy restricts browser clients.

## Validation

```sh
npm run typecheck
npm run build:web
```

## Portal features

- Administrator sign-in, persistent browser sessions, and token refresh
- Role-aware overview metrics and categorized activity logs
- Support tickets and email inquiries, ticket details, replies, and status
  updates
- Administrator account creation, editing, and deletion
- User lookup and profile updates, plus searches across posts, academic
  resources, and courses
- Institution, drop-off station, and advertisement management
- Tax-entry listing and tax-report requests

The backend remains responsible for authorization; hiding a tab in the UI is
not a substitute for backend access control.
