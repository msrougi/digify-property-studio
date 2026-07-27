# 15 - Database Architecture

Projeto: Digify Property Studio

Versão: 1.0

Status: Living Document

Documento: Database Architecture

---

# Objetivo

Definir toda a arquitetura de armazenamento de dados do Digify Property Studio.

O sistema deve suportar:

- projetos complexos
- múltiplos usuários
- IA
- plugins
- sincronização
- marketplace
- analytics
- escalabilidade

---

# Filosofia

O banco não deve apenas armazenar dados.

Ele deve representar conhecimento.

O vídeo permanece no sistema de arquivos.

O banco armazena apenas informações estruturadas.

---

# Estratégia

A plataforma utiliza múltiplos bancos especializados.

Cada serviço possui seu próprio armazenamento.

Nunca existe um banco monolítico.

---

# Arquitetura

```
                 Application
                      │
                      ▼
               Repository Layer
                      │
      ┌───────────────┼───────────────┐
      ▼               ▼               ▼
 Relational DB    Graph DB      Search Index
      ▼               ▼               ▼
 Metadata      Property Graph     Full Text
```

Cada tecnologia possui responsabilidade única.

---

# Tipos de Dados

Persistimos:

projetos

cenas

objetos

resultados IA

plugins

usuários

preferências

telemetria

configurações

licenças

Nunca armazenamos vídeos.

---

# Banco Relacional

Responsável por:

Usuários

Projetos

Licenças

Marketplace

Plugins

Preferências

Exportações

Assinaturas

---

# Banco de Grafos

Responsável por representar conhecimento.

Exemplo

```
Imóvel
 │
 ├── Sala
 │     ├── Sofá
 │     ├── TV
 │     └── Janela
 │
 ├── Cozinha
 │     ├── Ilha
 │     ├── Cooktop
 │     └── Mármore
 │
 └── Piscina
```

Esse banco alimenta o PIE™.

---

# Search Index

Responsável por:

busca rápida

projetos

objetos

templates

plugins

documentação

logs

---

# Cache

Utilizado para:

consultas frequentes

resultados IA

miniaturas

modelos

tokens

downloads

---

# Estrutura do Projeto

Cada projeto possui:

```
Projeto

↓

Timeline

↓

Cenas

↓

Frames

↓

Objetos

↓

Resultados IA

↓

Exportações

↓

Histórico
```

---

# Entidade Projeto

Campos principais

Project ID

Nome

Descrição

Idioma

Data

Versão

Status

Autor

Configurações

---

# Entidade Cena

Scene ID

Projeto

Timestamp

Tipo

Ambiente

Duração

Confidence

Narrativa

---

# Entidade Objeto

Object ID

Categoria

Bounding Box

Máscara

Profundidade

Material

Confidence

Relacionamentos

---

# Entidade Ambiente

Room ID

Tipo

Área estimada

Iluminação

Vista

Materiais

Luxury Score

Organization Score

---

# Entidade Resultado IA

Agent ID

Modelo

Versão

Confidence

Tempo

Resultado

Explicação

Logs

---

# Entidade Exportação

Export ID

Projeto

Codec

Resolução

FPS

Destino

Data

Tempo

Status

---

# Entidade Plugin

Plugin ID

Versão

Autor

Permissões

Categoria

Dependências

Marketplace ID

---

# Entidade Usuário

User ID

Plano

Idioma

Preferências

Licenças

Dispositivos

Sincronização

---

# Versionamento

Todo registro importante possui:

Versão

Autor

Data

Histórico

Rollback

---

# Soft Delete

Nenhum dado importante é removido imediatamente.

Estados

Ativo

Arquivado

Lixeira

Removido Permanentemente

---

# Auditoria

Toda alteração gera histórico.

Quem alterou.

Quando.

O que mudou.

Versão anterior.

---

# Property Knowledge Graph

Elemento central.

Representa:

ambientes

objetos

materiais

relações

características

oportunidades

problemas

Esse grafo evolui continuamente.

---

# Timeline Storage

Cada alteração da timeline gera eventos.

Exemplo

```
Adicionar Cena

↓

Mover Cena

↓

Excluir Cena

↓

Exportar
```

Todo histórico permanece disponível.

---

# Event Store

Eventos importantes

Projeto criado

Projeto salvo

Render iniciado

Render finalizado

Plugin instalado

Modelo atualizado

Erro

Crash

---

# Configurações

Separadas em:

Usuário

Projeto

Sistema

Plugins

Cloud

---

# Telemetria

Opcional.

Anonimizada.

Nunca armazenar dados privados sem autorização.

---

# Sincronização

Cada registro possui:

UUID

Versão

Timestamp

Checksum

Origem

Facilita resolução de conflitos.

---

# Índices

Criar índices para:

Project ID

User ID

Scene ID

Object ID

Plugin ID

Marketplace ID

Tempo

Status

---

# Integridade

Utilizar:

foreign keys

constraints

checks

versionamento

hashes

validação

---

# Backup

Incremental.

Versionado.

Criptografado.

Automático.

---

# Segurança

Criptografia em repouso.

Criptografia em trânsito.

Controle de acesso.

Assinaturas.

Integridade.

---

# Performance

Objetivos

Abrir projeto:

< 2 segundos

Buscar objeto:

< 100 ms

Consultar Knowledge Graph:

< 50 ms

Salvar projeto:

instantâneo (autosave)

---

# Escalabilidade

Preparado para:

milhões de projetos

bilhões de objetos detectados

milhares de plugins

centenas de modelos IA

---

# Banco Local

Armazena:

cache

projetos

configurações

histórico

telemetria local

Funciona completamente offline.

---

# Banco Cloud

Armazena apenas:

dados sincronizados

backup

marketplace

licenciamento

colaboração

analytics autorizados

---

# Migrações

Toda alteração estrutural deve possuir:

migração

rollback

compatibilidade

teste automatizado

---

# Tecnologias Recomendadas

## Relacional

PostgreSQL

---

## Banco de Grafos

Neo4j

---

## Busca

OpenSearch

---

## Cache

Redis

---

## Banco Local

SQLite

---

# Futuro

A arquitetura suporta:

- Digital Twin persistente;
- Knowledge Graph distribuído;
- IA federada;
- busca semântica;
- embeddings vetoriais;
- armazenamento de modelos personalizados;
- colaboração em tempo real.

---

# Definição de Sucesso

A Database Architecture será considerada bem-sucedida quando conseguir representar toda a inteligência do Digify de forma consistente, escalável e auditável, permitindo que qualquer componente da plataforma consulte informações sem duplicação de dados e sem comprometer a performance.