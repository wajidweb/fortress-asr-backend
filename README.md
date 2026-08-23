# Fortress ASR Backend API

This is the backend API for the **Fortress ASR Security Operations Management System (SOMS)**. It is built using Node.js, Express, TypeScript, and Prisma ORM with a MySQL database.

## Architecture

The backend strictly follows the **Model-View-Controller (MVC)** architectural pattern:

- **Models (`src/models/`, `prisma/schema.prisma`)**: Define the structural schemas, relationships, and direct database queries using the Prisma Client.
- **Views**: In the context of a headless API, the "views" are structured JSON payloads returned by the controllers.
- **Controllers (`src/controllers/`)**: Handle incoming requests, perform business logic validation (e.g., geofencing, compliance locks), orchestrate calculations, and delegate database tasks.
- **Routes (`src/routes/`)**: Define the HTTP verbs and URI endpoints, mounting specific middlewares and linking them directly to their corresponding controllers.

## Core Security Operations Rules Implemented

1. **Compliance Locking (SIA / Right to Work Expiry)**: Before shifts can be checked-in, the guard's credentials are automatically checked for active/expired status.
2. **Geofenced Check-In**: Checks actual coordinates against site coordinates using the Haversine formula (`src/utils/geo.ts`) before allowing a shift to check-in.
3. **Role-Based Access Control (RBAC)**: Enforces API authorization checks using the roles: `SYSTEM_ADMIN`, `SUPERVISOR`, `SECURITY_GUARD`, and `CLIENT`.

## Development Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Configure `.env` with your local MySQL credentials.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate Prisma Client:
   ```bash
   npm run prisma:generate
   ```
5. Run migrations to initialize the MySQL database:
   ```bash
   npm run prisma:migrate
   ```
6. Start development server:
   ```bash
   npm run dev
   ```
