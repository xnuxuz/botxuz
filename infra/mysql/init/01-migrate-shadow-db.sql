-- `prisma migrate dev` membuat shadow database sementara untuk mendeteksi drift.
-- User aplikasi diberi izin HANYA pada nama database bertema shadow, bukan *.*,
-- supaya tidak perlu kredensial root di file .env.
--
-- Dijalankan otomatis oleh entrypoint MySQL saat volume data pertama kali dibuat.
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'xnuxuz'@'%';
FLUSH PRIVILEGES;
