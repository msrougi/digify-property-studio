"""Reescreve nós DFT(inverse=1, onesided=1) do LaMa por uma construção equivalente.

Problema real: o ONNX Runtime <= 1.23.x (a última linha que ainda publica
binário pra macOS Intel no `onnxruntime-node`) rejeita, na inferência de
shape ao CARREGAR o modelo, qualquer nó DFT que combine `inverse=1` com
`onesided=1`:

    Node (node_DFT_2630) Op (DFT) [ShapeInferenceError]
    is_onesided and inverse attributes cannot be enabled at the same time

O LaMa usa Fast Fourier Convolutions, então tem 36 nós exatamente com essa
combinação (o `irfft` final de cada bloco). Resultado prático: o modelo
não carrega de jeito nenhum em Mac Intel, mesmo o arquivo estando presente
— ver docs/ml/HOME_STAGING.md.

Em vez de esperar a Microsoft republicar binário Intel numa versão com o
fix, este script corrige o MODELO: `irfft` é reescrito usando só operações
que o runtime antigo aceita, com a mesma matemática.

    irfft(X, n)  ==  real( idft( hermitian_full(X, n), n ) )

onde `hermitian_full` reconstrói o espectro completo a partir do espectro
"onesided" usando a simetria hermitiana de um sinal real:

    X_full[k] = X[k]                para k em [0, n-M]
    X_full[k] = conj(X[n-k])        para k em [M, n-1]

Tudo com comprimento `n` dinâmico (o modelo aceita qualquer resolução), via
Shape/Range/Gather — nenhum tamanho fixo é assumido.

Semântica de DFT(inverse=1, onesided=1) confirmada empiricamente contra um
runtime que a suporta (não deduzida da especificação): entrada
`[..., M, 2]` (espectro onesided), saída `[..., n, 1]` (sinal real),
idêntica a `numpy.fft.irfft`.
"""

import sys

import onnx
from onnx import TensorProto, helper, numpy_helper


def is_target(node: onnx.NodeProto) -> bool:
    attrs = {a.name: a.i for a in node.attribute}
    return node.op_type == "DFT" and attrs.get("inverse") == 1 and attrs.get("onesided") == 1


def rewrite(model: onnx.ModelProto) -> int:
    graph = model.graph
    initializers = {i.name: numpy_helper.to_array(i) for i in graph.initializer}

    new_nodes: list[onnx.NodeProto] = []
    replaced = 0

    for node in graph.node:
        if not is_target(node):
            new_nodes.append(node)
            continue

        spectrum, dft_length, axis_name = node.input[0], node.input[1], node.input[2]
        output = node.output[0]
        axis = int(initializers[axis_name])
        uid = f"irfft_{replaced}"

        def const(name: str, tensor: onnx.TensorProto) -> str:
            full = f"{uid}_{name}"
            graph.initializer.append(helper.make_tensor(full, tensor.data_type, tensor.dims, tensor.raw_data, raw=True))
            return full

        zero = const("zero", numpy_helper.from_array(_scalar_int64(0)))
        neg_one = const("neg_one", numpy_helper.from_array(_scalar_int64(-1)))
        conj_sign = const("conj_sign", numpy_helper.from_array(_conj_sign()))
        axis_idx = const("axis_idx", numpy_helper.from_array(_vector_int64([axis])))
        last_start = const("last_start", numpy_helper.from_array(_vector_int64([0])))
        last_end = const("last_end", numpy_helper.from_array(_vector_int64([1])))
        last_axis = const("last_axis", numpy_helper.from_array(_vector_int64([-1])))

        # M = número de bins do espectro onesided (dim `axis` da entrada).
        new_nodes.append(helper.make_node("Shape", [spectrum], [f"{uid}_shape"], name=f"{uid}_Shape"))
        new_nodes.append(
            helper.make_node("Gather", [f"{uid}_shape", axis_idx], [f"{uid}_M_vec"], name=f"{uid}_GatherM", axis=0)
        )
        new_nodes.append(
            helper.make_node("Squeeze", [f"{uid}_M_vec", last_start], [f"{uid}_M"], name=f"{uid}_SqueezeM")
        )

        # Índices espelhados: n-M, n-M-1, ..., 1  (conjugados de X[1..n-M]).
        new_nodes.append(
            helper.make_node("Sub", [dft_length, f"{uid}_M"], [f"{uid}_mirror_start"], name=f"{uid}_SubStart")
        )
        new_nodes.append(
            helper.make_node(
                "Range",
                [f"{uid}_mirror_start", zero, neg_one],
                [f"{uid}_mirror_idx"],
                name=f"{uid}_Range",
            )
        )
        new_nodes.append(
            helper.make_node(
                "Gather", [spectrum, f"{uid}_mirror_idx"], [f"{uid}_mirror"], name=f"{uid}_GatherMirror", axis=axis
            )
        )
        # conj: nega só a componente imaginária (última dimensão = [real, imag]).
        new_nodes.append(
            helper.make_node("Mul", [f"{uid}_mirror", conj_sign], [f"{uid}_mirror_conj"], name=f"{uid}_Conj")
        )
        new_nodes.append(
            helper.make_node(
                "Concat", [spectrum, f"{uid}_mirror_conj"], [f"{uid}_full"], name=f"{uid}_Concat", axis=axis
            )
        )

        # Inverse DFT completa (onesided=0 — a combinação que o runtime aceita).
        idft = helper.make_node(
            "DFT",
            [f"{uid}_full", dft_length, axis_name],
            [f"{uid}_complex"],
            name=f"{uid}_IDFT",
            inverse=1,
            onesided=0,
        )
        new_nodes.append(idft)

        # Sinal real: componente real, mantendo a última dimensão em 1
        # (mesmo formato que DFT(inverse=1, onesided=1) produzia).
        new_nodes.append(
            helper.make_node(
                "Slice",
                [f"{uid}_complex", last_start, last_end, last_axis],
                [output],
                name=f"{uid}_Real",
            )
        )

        replaced += 1

    del graph.node[:]
    graph.node.extend(new_nodes)
    return replaced


def _scalar_int64(value: int):
    import numpy as np

    return np.array(value, dtype=np.int64)


def _vector_int64(values):
    import numpy as np

    return np.array(values, dtype=np.int64)


def _conj_sign():
    import numpy as np

    return np.array([1.0, -1.0], dtype=np.float32)


def main() -> None:
    source, destination = sys.argv[1], sys.argv[2]
    print(f"Carregando {source}...")
    model = onnx.load(source)

    replaced = rewrite(model)
    print(f"Nós DFT(inverse=1, onesided=1) reescritos: {replaced}")
    if replaced == 0:
        print("Nada a fazer — modelo já compatível.")
        return

    print("Rodando onnx.checker...")
    onnx.checker.check_model(model, full_check=False)

    print(f"Salvando {destination}...")
    onnx.save(model, destination)
    print("OK")


if __name__ == "__main__":
    main()
