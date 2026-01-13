-- TaskFlow Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    qr_code_token VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project Members Table
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (
        role IN (
            'owner',
            'manager',
            'participant'
        )
    ),
    permissions JSONB DEFAULT '[]',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    invited_by_id UUID REFERENCES users (id),
    status VARCHAR(50) DEFAULT 'accepted' CHECK (
        status IN (
            'invited',
            'accepted',
            'rejected'
        )
    ),
    UNIQUE (project_id, user_id)
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (
        status IN (
            'new',
            'in_progress',
            'review',
            'done'
        )
    ),
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (
        priority IN (
            'low',
            'medium',
            'high',
            'critical'
        )
    ),
    task_type VARCHAR(50) NOT NULL DEFAULT 'task' CHECK (
        task_type IN (
            'task',
            'bug',
            'improvement',
            'research'
        )
    ),
    assignee_id UUID REFERENCES users (id) ON DELETE SET NULL,
    created_by_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    estimated_hours NUMERIC(5, 2),
    actual_hours NUMERIC(5, 2),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    mentions JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (
        type IN (
            'task_assigned',
            'deadline_reminder',
            'comment_mention',
            'task_completed'
        )
    ),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    related_task_id UUID REFERENCES tasks (id) ON DELETE CASCADE,
    related_project_id UUID REFERENCES projects (id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

-- Sync Queue Table (для синхронизации офлайн изменений)
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (
        entity_type IN (
            'task',
            'comment',
            'project',
            'project_member'
        )
    ),
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'synced', 'failed')
    ),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP,
    attempt_count INTEGER DEFAULT 0
);

-- Indexes for performance
CREATE INDEX idx_projects_owner ON projects (owner_id);

CREATE INDEX idx_project_members_project ON project_members (project_id);

CREATE INDEX idx_project_members_user ON project_members (user_id);

CREATE INDEX idx_tasks_project ON tasks (project_id);

CREATE INDEX idx_tasks_assignee ON tasks (assignee_id);

CREATE INDEX idx_tasks_status ON tasks (status);

CREATE INDEX idx_tasks_created_by ON tasks (created_by_id);

CREATE INDEX idx_comments_task ON comments (task_id);

CREATE INDEX idx_notifications_user ON notifications (user_id);

CREATE INDEX idx_notifications_unread ON notifications (user_id, is_read)
WHERE
    is_read = false;

CREATE INDEX idx_sync_queue_user_status ON sync_queue (user_id, status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();