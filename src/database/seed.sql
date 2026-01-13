-- 5 пользователей
INSERT INTO
    users (
        email,
        password_hash,
        name,
        avatar_url
    )
VALUES (
        'alice@example.com',
        'hash1',
        'Alice',
        'https://i.pravatar.cc/150?img=1'
    ),
    (
        'bob@example.com',
        'hash2',
        'Bob',
        'https://i.pravatar.cc/150?img=2'
    ),
    (
        'carol@example.com',
        'hash3',
        'Carol',
        'https://i.pravatar.cc/150?img=3'
    ),
    (
        'dave@example.com',
        'hash4',
        'Dave',
        'https://i.pravatar.cc/150?img=4'
    ),
    (
        'eve@example.com',
        'hash5',
        'Eve',
        'https://i.pravatar.cc/150?img=5'
    );

-- 3 проекта
INSERT INTO
    projects (name, description, owner_id)
VALUES (
        'Project Alpha',
        'First project',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Alice'
        )
    ),
    (
        'Project Beta',
        'Second project',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        )
    ),
    (
        'Project Gamma',
        'Third project',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Carol'
        )
    );

-- Добавим участников
INSERT INTO
    project_members (
        project_id,
        user_id,
        role,
        permissions
    )
VALUES (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Alpha'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Alice'
        ),
        'owner',
        '["all"]'
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Alpha'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        ),
        'participant',
        '["read","write"]'
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Beta'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        ),
        'owner',
        '["all"]'
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Beta'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Eve'
        ),
        'participant',
        '["read"]'
    );

-- 5 задач
INSERT INTO
    tasks (
        project_id,
        title,
        description,
        status,
        priority,
        assignee_id,
        created_by_id
    )
VALUES (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Alpha'
        ),
        'Setup DB',
        'Setup initial database schema',
        'new',
        'high',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Alice'
        )
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Alpha'
        ),
        'Design UI',
        'Create initial UI mockups',
        'in_progress',
        'medium',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Alice'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Alice'
        )
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Beta'
        ),
        'API Development',
        'Develop backend API',
        'review',
        'high',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Eve'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        )
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Beta'
        ),
        'Write Tests',
        'Write unit tests for API',
        'new',
        'medium',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Eve'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        )
    ),
    (
        (
            SELECT id
            FROM projects
            WHERE
                name = 'Project Gamma'
        ),
        'Research',
        'Research new technologies',
        'done',
        'low',
        (
            SELECT id
            FROM users
            WHERE
                name = 'Carol'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Carol'
        )
    );

INSERT INTO
    comments (task_id, user_id, text)
VALUES (
        (
            SELECT id
            FROM tasks
            WHERE
                title = 'Setup DB'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Alice'
        ),
        'Initial setup done.'
    ),
    (
        (
            SELECT id
            FROM tasks
            WHERE
                title = 'Design UI'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Bob'
        ),
        'Working on UI mockups.'
    ),
    (
        (
            SELECT id
            FROM tasks
            WHERE
                title = 'API Development'
        ),
        (
            SELECT id
            FROM users
            WHERE
                name = 'Eve'
        ),
        'API endpoints ready for review.'
    );