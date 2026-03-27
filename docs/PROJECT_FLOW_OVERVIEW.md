# Project Flow Overview

## Goal

This document explains the total flow of the project as a product and as a codebase.

It is meant to answer:
- what the portal is
- how the main domains connect
- what remains source of truth
- how development should evolve safely

## 1. Product flow at a glance

The portal combines four connected layers:

### Platform Core
- users
- auth
- roles
- tenant control
- auditability

### PMS Core
- units
- bookings
- guests
- pricing
- payments / invoices

### Ops Core
- arrivals / departures
- staff tasks
- housekeeping
- maintenance

### Smart Building Core
- devices
- device state
- alerts
- telemetry
- scenes and rules
- operations intelligence

## 2. Source-of-truth rules

These rules are critical.

### PMS/Ops remains source of truth for:
- booking lifecycle
- unit operational ownership
- staff task generation
- housekeeping logic
- maintenance operational workflow

### Smart Building owns:
- device inventory
- device/telemetry state
- smart alerts
- scenes / automation rules
- smart read models

### Smart Building must not:
- recreate PMS task generation
- create a parallel booking state machine
- replace staff workflows

## 3. Real product flow

### Booking created or updated
- PMS creates / updates booking
- Ops automation may create staff tasks
- Smart Building may react to resulting business events

### Device state changes
- provider sync / poll / webhook updates device state
- device events may be stored
- alerts may open or resolve
- health / readiness / operations read models update logically

### Operator actions
- operator reviews dashboard or operations
- operator opens unit detail or assistant
- operator may trigger supported scene or acknowledge alert
- PMS/Ops workflows remain separate and authoritative

## 4. Smart feature flow by maturity

### Foundation
- devices, states, alerts, commands

### Coordination
- scenes, rules, executions, taxonomy, correlation

### Operational value
- dashboard, operations mode, readiness, assistants

### Property readiness
- setup wizard, provider registry, property model

### Observability
- health monitoring, freshness, telemetry, insights

## 5. Development flow expected in this repository

### Safe sequence
1. inspect current domain owner
2. identify source of truth
3. implement minimal-impact extension
4. add/update tests
5. run build / checks
6. document what changed

### Unsafe sequence to avoid
1. add parallel logic in Smart and PMS
2. move source of truth implicitly
3. skip tests and migration
4. patch UI without understanding route/service contract

## 6. Architecture direction

Current strategy:
- modular monolith
- backend remains central business brain
- provider adapters stay integration-facing
- PostgreSQL remains transactional core

Future direction:
- optional MQTT
- optional workers / async components
- deeper Home Assistant integration
- still no need for microservices unless justified later

## 7. What a new contributor should understand first

1. this is already a working product
2. PMS/Ops and Smart have explicit boundaries
3. most dangerous changes affect tenant isolation and workflow ownership
4. frontend and backend are both already structured enough to extend incrementally
5. documentation must be updated with every meaningful feature or architecture step
