# Faction Compare

Compares the members of two Torn City factions ahead of a war, to show who
can profitably attack whom.

## Language

### Members

**Attacker**:
A member considered in the role of starting a fight against a member of the
opposing faction.

**Defender**:
A member considered in the role of being attacked by a member of the opposing
faction.

**Battle score estimate**:
An outside estimate of a member's fighting strength. A member may have none.
_Avoid_: Stats, BSS, BS

**Unavailable member**:
A member who can neither attack nor be attacked for the foreseeable future:
one who is Fallen or in Federal jail.

**Selected member**:
The one member of each faction whose details the member views show.
_Avoid_: Drill-down member, member details selection

### Wars

**Termed war**:
A war whose conduct both factions have agreed in advance.

**Hit**:
A fight an attacker wins against a defender, which puts the defender in
hospital for a time.
_Avoid_: Attack (an attack may fail)

**Hit goal**:
The number of hits each attacker aims to reach in a termed war.
_Avoid_: Hit target (clashes with target), quota

**Called hit**:
A hit claimed by one attacker before it is made, so that no other attacker
attempts the same defender at the same time.

**Release**:
The moment a defender leaves hospital and can be attacked again.

**Med out**:
A defender ending their own hospital stay early with a medical item, at the
cost of medical cooldown.

**Medical cooldown cap**:
The amount of medical cooldown above which a player can use no more medical
items until it has decayed below the cap again.

**Contention**:
Several attackers wanting the same defender at their release. Only one of
them gets the hit; the rest wait for the next release of one of their
targets.

### Fair fight

**Fair fight (FF)**:
A score for one attacker against one defender describing how strong the
defender is relative to the attacker. Higher means a relatively stronger
defender.
_Avoid_: Fairness, FF score

**Difficulty**:
How hard a target is for an attacker, determined by fair fight alone.

### Targets

**Target range**:
The span of fair fight values within which a defender is worth attacking,
bounded by a minimum and a maximum.
_Avoid_: FF limits, acceptable range

**Target**:
A defender whose fair fight for a given attacker falls inside the target
range. Always relative to one attacker.
_Avoid_: Available target, possible attack

**Shared target**:
A defender who is a target for more than one attacker.

**Share count**:
The number of attackers for whom a given defender is a target.

**Target count**:
The number of defenders who are targets for a given attacker.

**Target heatmap**:
A grid of one faction's attackers against the other faction's defenders that
marks each target and shows its difficulty.

**Pinned cell**:
The one cell of a target heatmap held open for inspection, identified by its
attacker and its defender, however it was reached. Its attacker is the
selected member of the attacking faction.
_Avoid_: Keyboard cursor, focused cell, active cell
