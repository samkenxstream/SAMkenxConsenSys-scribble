import {
    SourceUnit,
    ExportedSymbol,
    ImportDirective,
    ASTNode,
    ContractDefinition,
    FunctionDefinition,
    ASTNodeFactory,
    Identifier,
    IdentifierPath,
    UserDefinedTypeName,
    MemberAccess,
    StructDefinition,
    EnumDefinition,
    ErrorDefinition,
    VariableDeclaration,
    replaceNode,
    assert,
    PragmaDirective
} from "solc-typed-ast";
import { getOrInit, topoSort } from "../util";

/**
 * When flattening units, we may introduce two definitions with the same name.
 * Rename definitions accordingly.
 *
 * @param units - units to flatten
 */
function fixNameConflicts(units: SourceUnit[]): Set<ExportedSymbol> {
    const nameMap = new Map<string, ExportedSymbol[]>();

    for (const unit of units) {
        unit.vContracts.forEach((contr) => getOrInit(contr.name, nameMap, []).push(contr));
        unit.vStructs.forEach((struct) => getOrInit(struct.name, nameMap, []).push(struct));
        unit.vEnums.forEach((enumDef) => getOrInit(enumDef.name, nameMap, []).push(enumDef));
        unit.vErrors.forEach((errDef) => getOrInit(errDef.name, nameMap, []).push(errDef));
        unit.vVariables.forEach((varDef) => getOrInit(varDef.name, nameMap, []).push(varDef));
        unit.vFunctions.forEach((funDef) => getOrInit(funDef.name, nameMap, []).push(funDef));
        unit.vImportDirectives.forEach((impDef) => {
            if (impDef.unitAlias !== "") getOrInit(impDef.unitAlias, nameMap, []).push(impDef);
        });
    }

    const renamed = new Set<ExportedSymbol>();

    for (const [, defs] of nameMap) {
        // Rename all defs after the first one
        for (let defIdx = 1; defIdx < defs.length; defIdx++) {
            const def = defs[defIdx];

            if (def instanceof ImportDirective) {
                def.unitAlias += `_${defIdx}`;
            } else {
                def.name += `_${defIdx}`;
            }

            renamed.add(def);
        }
    }

    return renamed;
}

function getTypeScope(n: ASTNode): SourceUnit | ContractDefinition {
    const typeScope = n.getClosestParentBySelector(
        (p: ASTNode) => p instanceof SourceUnit || p instanceof ContractDefinition
    ) as SourceUnit | ContractDefinition;
    return typeScope;
}

function getFQName(def: ExportedSymbol, atUseSite: ASTNode): string {
    if (def instanceof ImportDirective) {
        return def.unitAlias;
    }

    if (def instanceof ContractDefinition) {
        return def.name;
    }

    const scope = def.vScope;
    assert(
        scope instanceof SourceUnit || scope instanceof ContractDefinition,
        `Unexpected scope ${
            scope.constructor.name
        } for def ${def.print()} at site ${atUseSite.print()}}`
    );

    if (scope instanceof SourceUnit) {
        return def.name;
    } else {
        if (def instanceof FunctionDefinition && getTypeScope(def) === getTypeScope(atUseSite)) {
            return def.name;
        }

        return scope.name + "." + def.name;
    }
}

/**
 * Sort contract definitions in topological order based on their inheritance.
 *
 * @param contracts - units to sort
 */
function sortContracts(contracts: ContractDefinition[]): ContractDefinition[] {
    // Partial order of contracts
    const order: Array<[ContractDefinition, ContractDefinition]> = [];

    for (const contract of contracts) {
        for (const base of contract.vLinearizedBaseContracts) {
            if (base !== contract) {
                order.push([base, contract]);
            }
        }
    }

    return order.length > 0 ? topoSort(contracts, order) : contracts;
}

/**
 * Given a list of `SourceUnit`s `units`, perform "flattening" of all imports to allow the units to be concatenated into a single unit.
 * This involves several tasks:
 *
 * 1. Rename any top-level definitions with conflicting names to the same namne
 * 2. For any `Identifier`, `IdentifierPath`, `UserDefinedTypeName` or `MemberAccess` referring to a renamed top-level definition fix the name.
 * 3. For any `Identifier`, `IdentifierPath`, `UserDefinedTypeName` referring to a name that was declared in an import statement (e.g. `improt {X as Y}...`) fix
 *    the name to point to the name of the original defintion.
 * 4. For any `MemberAccess` that has a unit alias as its base (e.g. `import "..." as Lib`) convert it to an `Identifier` referring directly to the original imported definition.
 * 5. For any `MemberAccess` pointing to a state variable that was renamed due to instrumentation (happens sometimes) also fix that name
 * 6. Merge all the fixed top-level definitions in a single SourceUnit
 * 7. Fix all broken vScopes to point to the correct source unit.
 * 8. Sort contracts in topological order of their inheritance
 * @param units
 * @param factory
 */
export function flattenUnits(
    units: SourceUnit[],
    factory: ASTNodeFactory,
    flatFileName: string
): SourceUnit {
    const renamed = fixNameConflicts(units);

    for (const unit of units) {
        for (const refNode of unit.getChildrenBySelector(
            (node) =>
                node instanceof Identifier ||
                node instanceof IdentifierPath ||
                node instanceof UserDefinedTypeName ||
                node instanceof MemberAccess
        ) as Array<Identifier | IdentifierPath | UserDefinedTypeName | MemberAccess>) {
            const def = refNode.vReferencedDeclaration;

            // Only interested in references to exportable symbols
            if (
                def === undefined ||
                !(
                    def instanceof ContractDefinition ||
                    def instanceof StructDefinition ||
                    def instanceof EnumDefinition ||
                    def instanceof ErrorDefinition ||
                    def instanceof FunctionDefinition ||
                    (def instanceof VariableDeclaration && def.vScope instanceof SourceUnit)
                )
            ) {
                continue;
            }

            // Only interested in references to top-level symbols (they are the only ones affected by flattening)
            if (!(def.vScope instanceof SourceUnit)) {
                continue;
            }

            const fqName = getFQName(def, refNode);

            // Member accesses that have an unit import alias as a base need to be replaced with ids
            if (
                refNode instanceof MemberAccess &&
                refNode.vExpression instanceof Identifier &&
                refNode.vExpression.vReferencedDeclaration instanceof ImportDirective
            ) {
                replaceNode(refNode, factory.makeIdentifierFor(def));
            }

            // If we have:
            // 1. Identifiers other than "this"
            // 2. Identifier paths
            // 3. UserDefinedTypeNames with a name (the case when they have a path instead of name is handled in 2.)
            //
            // AND the original definition is part of the `renamed` set, or the name differs from the original def for other reasons,
            // fix the name of the node to the fully-qualified name.
            // TODO: (dimo): It might be cleaner here to replace `Identifier` with `IdentifierPath` when `fqName` has dots in it.
            if (
                (refNode instanceof Identifier &&
                    !(
                        refNode.name === "this" &&
                        refNode.vReferencedDeclaration instanceof ContractDefinition
                    )) ||
                refNode instanceof IdentifierPath ||
                (refNode instanceof UserDefinedTypeName && refNode.name !== undefined)
            ) {
                if (renamed.has(def) || refNode.name !== def.name) {
                    refNode.name = fqName;
                }
            }
        }
    }

    for (const unit of units) {
        for (const imp of unit.vImportDirectives) {
            unit.removeChild(imp);
        }
    }

    const flatUnit = factory.makeSourceUnit(flatFileName, 0, flatFileName, new Map());
    let contracts: ContractDefinition[] = [];

    for (const unit of units) {
        for (const def of unit.children) {
            // Skip import directives and compiler pragmas
            if (
                def instanceof ImportDirective ||
                (def instanceof PragmaDirective && def.vIdentifier === "solidity")
            ) {
                continue;
            }

            if (def instanceof ContractDefinition) {
                contracts.push(def);
            } else {
                flatUnit.appendChild(def);
            }
        }
    }

    contracts = sortContracts(contracts);

    for (const def of contracts) {
        flatUnit.appendChild(def);
    }

    flatUnit.acceptChildren();

    for (const nd of flatUnit.getChildrenBySelector(
        (nd) =>
            nd instanceof ContractDefinition ||
            nd instanceof StructDefinition ||
            nd instanceof FunctionDefinition ||
            nd instanceof VariableDeclaration ||
            nd instanceof ImportDirective
    ) as Array<
        | ContractDefinition
        | StructDefinition
        | FunctionDefinition
        | VariableDeclaration
        | ImportDirective
    >) {
        if (nd.vScope instanceof SourceUnit && nd.vScope !== flatUnit) {
            nd.scope = flatUnit.id;
        }
    }

    return flatUnit;
}
