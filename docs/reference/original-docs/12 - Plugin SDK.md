# 12 - Plugin SDK

Projeto: Digify Property Studio

Versão: 1.0

Status: Living Document

Documento: Plugin SDK

---

# Objetivo

O Plugin SDK define como desenvolvedores poderão criar extensões para o Digify Property Studio.

O objetivo é permitir que novas funcionalidades sejam adicionadas sem alterar o código principal da aplicação.

Toda extensão deve respeitar a arquitetura do Property Intelligence Engine (PIE™).

---

# Filosofia

O núcleo do Digify deve permanecer pequeno.

Novas funcionalidades devem nascer como plugins sempre que possível.

Isso garante:

• maior estabilidade

• atualizações independentes

• marketplace saudável

• inovação contínua

---

# O que um Plugin pode fazer

Um plugin poderá:

• criar novas ferramentas

• adicionar novos painéis

• criar novos agentes de IA

• adicionar modelos

• criar novos exportadores

• criar novos templates

• integrar APIs externas

• criar novos formatos de projeto

• criar novos detectores

• adicionar novos renderizadores

---

# O que um Plugin NÃO pode fazer

Não poderá:

• modificar o núcleo do PIE™

• acessar memória de outros plugins

• alterar arquivos do sistema

• ignorar regras de segurança

• burlar o sistema de permissões

• modificar projetos sem autorização

---

# Arquitetura

```
Application

↓

Plugin Manager

↓

Plugin Sandbox

↓

Plugin

↓

SDK

↓

Core APIs

```

Todo plugin roda isoladamente.

---

# Ciclo de Vida

Instalação

↓

Validação

↓

Registro

↓

Inicialização

↓

Execução

↓

Atualização

↓

Desativação

↓

Remoção

---

# Estrutura de um Plugin

```
plugin.json

icon.png

README.md

main.dll / dylib / so

resources/

models/

translations/

assets/
```

---

# Manifesto

Todo plugin possui:

Nome

ID

Versão

Autor

Licença

Categoria

Compatibilidade

Descrição

Permissões

Dependências

Website

Suporte

---

# Categorias

AI Agent

Vision

Rendering

Export

Template

Workflow

Integration

Cloud

Analytics

Marketplace

Developer

UI

---

# Plugin Manager

Responsável por:

descobrir plugins

instalar

atualizar

remover

habilitar

desabilitar

resolver dependências

---

# Plugin Sandbox

Todo plugin roda em ambiente isolado.

Nenhum plugin acessa diretamente:

memória do núcleo

arquivos privados

dados de outros plugins

---

# Sistema de Permissões

Exemplos

Acessar projetos

Acessar internet

Criar arquivos

Executar IA

Usar GPU

Modificar exportação

Adicionar painéis

Cada permissão deve ser aprovada pelo usuário.

---

# APIs Disponíveis

## Project API

Abrir projeto

Salvar

Criar

Duplicar

Exportar

---

## Timeline API

Ler timeline

Adicionar cena

Remover cena

Mover cena

Inserir marcador

---

## Video API

Ler frames

Criar preview

Renderizar

Criar proxy

Extrair frame

---

## Audio API

Ler áudio

Criar trilha

Aplicar efeitos

Exportar

---

## Vision API

Consultar objetos

Consultar ambientes

Consultar profundidade

Consultar materiais

Consultar iluminação

---

## AI API

Registrar agente

Executar agente

Consultar contexto

Consultar confidence

Retornar resultados

---

## Render API

Criar efeito

Criar overlay

Criar camada

Renderizar frame

---

## UI API

Criar janela

Criar painel

Criar diálogo

Criar botão

Criar menu

Criar atalhos

---

## Export API

Registrar exportador

Criar formatos

Criar presets

Criar destinos

---

## Analytics API

Registrar métricas

Registrar eventos

Registrar performance

---

# Eventos

Plugins podem escutar eventos.

Exemplos

Projeto aberto

Projeto salvo

Render iniciado

Render concluído

Export iniciado

Objeto detectado

Novo agente registrado

Plugin instalado

---

# Hooks

Antes da Importação

Após Importação

Antes da IA

Após IA

Antes do Render

Após Render

Antes da Exportação

Após Exportação

---

# IA como Plugin

Todo novo agente poderá ser instalado como plugin.

Exemplo

AI Drone Optimizer

↓

Instalar

↓

Registrar

↓

PIE passa a utilizá-lo automaticamente.

---

# Templates

Plugins podem adicionar:

presets

identidade visual

paletas

perfis

workflows

---

# Marketplace

Todo plugin poderá ser distribuído pelo Marketplace.

Cada plugin possui:

nota

downloads

comentários

versões

histórico

autor

---

# Atualizações

Atualizações devem ocorrer sem reinstalar o aplicativo.

Cada plugin possui ciclo próprio.

---

# Versionamento

Semantic Versioning.

MAJOR.MINOR.PATCH

Exemplo

2.4.1

---

# Compatibilidade

Cada plugin informa:

Versão mínima

Versão máxima

Recursos necessários

SO compatível

GPU necessária

---

# Performance

Plugins não podem comprometer a experiência do usuário.

Cada plugin possui limites de:

CPU

RAM

GPU

Tempo de execução

---

# Logging

Cada plugin gera logs próprios.

Facilita:

debug

telemetria

auditoria

suporte

---

# Segurança

Plugins são assinados digitalmente.

Plugins alterados invalidam a assinatura.

O usuário sempre será informado.

---

# SDK Oficial

O SDK fornecerá:

documentação

exemplos

CLI

templates

testes

gerador de plugins

simulador

debugger

---

# Linguagens Suportadas

Inicialmente

Rust

C++

Python (restrito)

JavaScript/TypeScript (para automações e UI)

No futuro:

C#

Go

Swift

---

# Testes

Todo plugin deve passar por:

validação

segurança

performance

compatibilidade

estabilidade

antes de ser publicado.

---

# Certificação

Plugins aprovados recebem o selo:

**Digify Certified**

Garantindo:

compatibilidade

qualidade

segurança

performance

---

# Objetivo Final

O Plugin SDK existe para transformar o Digify Property Studio em uma plataforma aberta, extensível e sustentável.

A inovação não deve depender apenas da equipe da Digify.

Qualquer desenvolvedor deve poder ampliar o ecossistema mantendo os mesmos padrões de qualidade, segurança e experiência do usuário.