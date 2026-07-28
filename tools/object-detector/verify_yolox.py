"""Verificação da lógica YOLOX (preprocess + decode + NMS) antes de portar pra TS."""
import numpy as np
import onnxruntime as ort
from PIL import Image

COCO_CLASSES = (
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
)

INPUT_SIZE = 416


def preprocess(image: Image.Image):
    img = np.array(image.convert("RGB"))[:, :, ::-1]  # RGB -> BGR (cv2 convention usado no treino)
    padded = np.ones((INPUT_SIZE, INPUT_SIZE, 3), dtype=np.uint8) * 114
    r = min(INPUT_SIZE / img.shape[0], INPUT_SIZE / img.shape[1])
    resized = np.array(
        Image.fromarray(img[:, :, ::-1]).resize(
            (int(img.shape[1] * r), int(img.shape[0] * r))
        )
    )[:, :, ::-1]
    padded[: resized.shape[0], : resized.shape[1]] = resized
    padded = padded.transpose(2, 0, 1).astype(np.float32)
    return padded, r


def demo_postprocess(outputs, img_size):
    grids, strides = [], []
    for stride in (8, 16, 32):
        hsize, wsize = img_size[0] // stride, img_size[1] // stride
        xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
        grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
        grids.append(grid)
        strides.append(np.full((1, grid.shape[1], 1), stride))
    grids = np.concatenate(grids, 1)
    strides = np.concatenate(strides, 1)
    outputs[..., :2] = (outputs[..., :2] + grids) * strides
    outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * strides
    return outputs


def nms(boxes, scores, thr=0.45):
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1, yy1 = np.maximum(x1[i], x1[order[1:]]), np.maximum(y1[i], y1[order[1:]])
        xx2, yy2 = np.minimum(x2[i], x2[order[1:]]), np.minimum(y2[i], y2[order[1:]])
        w, h = np.maximum(0.0, xx2 - xx1 + 1), np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[np.where(ovr <= thr)[0] + 1]
    return keep


def detect(session, image_path, score_thr=0.3):
    img = Image.open(image_path)
    tensor, ratio = preprocess(img)
    output = session.run(None, {"images": tensor[None, :, :, :]})[0]
    predictions = demo_postprocess(output, (INPUT_SIZE, INPUT_SIZE))[0]

    boxes = predictions[:, :4]
    scores = predictions[:, 4:5] * predictions[:, 5:]

    boxes_xyxy = np.ones_like(boxes)
    boxes_xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2.0
    boxes_xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2.0
    boxes_xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2.0
    boxes_xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2.0
    boxes_xyxy /= ratio

    cls_inds = scores.argmax(1)
    cls_scores = scores[np.arange(len(cls_inds)), cls_inds]
    mask = cls_scores > 0.1
    valid_boxes, valid_scores, valid_cls = boxes_xyxy[mask], cls_scores[mask], cls_inds[mask]
    keep = nms(valid_boxes, valid_scores)

    results = []
    for i in keep:
        if valid_scores[i] >= score_thr:
            results.append((COCO_CLASSES[valid_cls[i]], float(valid_scores[i]), valid_boxes[i].tolist()))
    return results


if __name__ == "__main__":
    session = ort.InferenceSession("yolox_nano.onnx")
    for path in [
        "../room-classifier/data/kitchen/1.jpg",
        "../room-classifier/data/bedroom/1.jpg",
        "../room-classifier/data/bathroom/1.jpg",
    ]:
        print(f"\n=== {path} ===")
        for cls, score, box in detect(session, path):
            print(f"  {cls}: {score:.2f}  box={[round(v) for v in box]}")
