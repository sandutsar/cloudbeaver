CREATE TABLE {table_prefix}CB_AUTH_TOKEN
(
    TOKEN_ID VARCHAR(128) NOT NULL,
    SESSION_ID VARCHAR(64) NOT NULL,
    USER_ID VARCHAR(128),

    EXPIRATION_TIME TIMESTAMP NOT NULL,
    CREATE_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

    PRIMARY KEY (TOKEN_ID),
    FOREIGN KEY (SESSION_ID) REFERENCES {table_prefix}CB_SESSION (SESSION_ID) ON DELETE CASCADE,
    FOREIGN KEY (USER_ID) REFERENCES {table_prefix}CB_USER (USER_ID) ON DELETE CASCADE
);
