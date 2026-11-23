"""Makes kokoro-timed.onnx: the same speech model with one more output, `duration` — how many frames each input symbol lasts.
kokoro-onnx reports phoneme timings (create_timed) only for a model that has this output; the released model keeps the
durations inside. syllables.py needs them to know where one syllable ends and the next begins.
usage: timed_model.py   (needs `pip install onnx`; reads and writes next to this file, or in $PRON_MODELS)"""
import os, onnx
from onnx import helper, TensorProto
from course import HERE
folder = os.environ.get('PRON_MODELS', HERE)
m = onnx.load(os.path.join(folder, 'kokoro-v1.0.onnx'))
# the rounded, clamped durations are what the model turns into its alignment: the first input of /encoder/CumSum
source = next(n for n in m.graph.node if n.name == '/encoder/CumSum').input[0]
m.graph.node.append(helper.make_node('Cast', [source], ['duration'], to=TensorProto.INT64, name='duration_out'))
m.graph.output.append(helper.make_tensor_value_info('duration', TensorProto.INT64, None))
onnx.save(m, os.path.join(folder, 'kokoro-timed.onnx'))
print('wrote kokoro-timed.onnx')
