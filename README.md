# Supplier Dashboard Backend

Node.js Express backend for Supplier Dashboard with Supabase integration.

## Prerequisites

- Node.js (v16+)
- Supabase account and project
- npm or yarn

## Installation

```bash
npm install
```

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
PORT=3000
NODE_ENV=development
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The API will be available at `http://localhost:3000`

## Project Structure

```
src/
├── server.js           # Main Express server
├── config/            # Configuration files
├── routes/            # API routes
├── controllers/       # Route controllers
├── middleware/        # Custom middleware
├── utils/             # Utility functions
└── db/                # Database initialization
```

## Features

Features will be added incrementally based on requirements.

## API Documentation

API endpoints will be documented as features are added.
