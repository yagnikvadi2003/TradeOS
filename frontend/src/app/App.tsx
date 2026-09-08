import { RouterProvider } from 'react-router';
import { AppProviders } from './providers/app-providers';
import { createAppRouter } from './router/routes';

const router = createAppRouter();

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
