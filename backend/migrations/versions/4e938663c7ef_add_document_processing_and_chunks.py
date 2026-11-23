"""add_document_processing_and_chunks

Revision ID: 4e938663c7ef
Revises: 477912783e2a
Create Date: 2026-11-23 14:21:27.279268

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4e938663c7ef'
down_revision: Union[str, None] = '477912783e2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create document_pages table
    op.create_table(
        'document_pages',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('document_id', sa.String(length=36), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('extracted_text', sa.Text(), nullable=False),
        sa.Column('character_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('document_pages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_document_pages_document_id'), ['document_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_document_pages_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_document_pages_page_number'), ['page_number'], unique=False)

    # 2. Create document_chunks table
    op.create_table(
        'document_chunks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('document_id', sa.String(length=36), nullable=False),
        sa.Column('page_id', sa.String(length=36), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('character_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['page_id'], ['document_pages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('document_chunks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_document_chunks_chunk_index'), ['chunk_index'], unique=False)
        batch_op.create_index(batch_op.f('ix_document_chunks_document_id'), ['document_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_document_chunks_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_document_chunks_page_id'), ['page_id'], unique=False)

    # 3. Add columns to documents table
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('normalized_filename', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('processing_status', sa.String(length=50), nullable=False, server_default='not_started'))
        batch_op.add_column(sa.Column('total_pages', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('extracted_pages', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('total_chunks', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('processed_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('processing_error', sa.Text(), nullable=True))

    # Populate normalized_filename from existing original_filename
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE documents SET normalized_filename = LOWER(TRIM(original_filename)) WHERE normalized_filename IS NULL"))

    # Resolve any existing duplicate normalized_filenames per user without deleting documents
    conn.execute(sa.text("""
        UPDATE documents 
        SET normalized_filename = normalized_filename || '_' || SUBSTR(id, 1, 8)
        WHERE id NOT IN (
            SELECT MIN(id) FROM documents GROUP BY user_id, normalized_filename
        )
    """))

    # 4. Now apply NOT NULL and UNIQUE constraint on normalized_filename
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.alter_column('normalized_filename', nullable=False)
        batch_op.create_index(batch_op.f('ix_documents_normalized_filename'), ['normalized_filename'], unique=False)
        batch_op.create_index(batch_op.f('ix_documents_processing_status'), ['processing_status'], unique=False)
        batch_op.create_unique_constraint('uq_user_normalized_filename', ['user_id', 'normalized_filename'])


def downgrade() -> None:
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_constraint('uq_user_normalized_filename', type_='unique')
        batch_op.drop_index(batch_op.f('ix_documents_processing_status'))
        batch_op.drop_index(batch_op.f('ix_documents_normalized_filename'))
        batch_op.drop_column('processing_error')
        batch_op.drop_column('processed_at')
        batch_op.drop_column('total_chunks')
        batch_op.drop_column('extracted_pages')
        batch_op.drop_column('total_pages')
        batch_op.drop_column('processing_status')
        batch_op.drop_column('normalized_filename')

    with op.batch_alter_table('document_chunks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_document_chunks_page_id'))
        batch_op.drop_index(batch_op.f('ix_document_chunks_id'))
        batch_op.drop_index(batch_op.f('ix_document_chunks_document_id'))
        batch_op.drop_index(batch_op.f('ix_document_chunks_chunk_index'))

    op.drop_table('document_chunks')
    with op.batch_alter_table('document_pages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_document_pages_page_number'))
        batch_op.drop_index(batch_op.f('ix_document_pages_id'))
        batch_op.drop_index(batch_op.f('ix_document_pages_document_id'))

    op.drop_table('document_pages')
