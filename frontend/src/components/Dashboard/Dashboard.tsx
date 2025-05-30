import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const CLIENT_URL = `/client`;
const MODEL_URL = `/model`;

const generateClassColors = (classes: string[]) => {
  const uniqueClasses = [...new Set(classes)];

  const colors = [
    "#FF0000",
    "#0000FF",
    "#FFFF00",
    "#00FF00",
    "#FF00FF",
    "#00FFFF",
    "#FFA500",
    "#800080",
    "#008000",
    "#FFC0CB",
  ];

  const classColorMap: Record<string, string> = {};

  uniqueClasses.forEach((className, index) => {
    if (index < colors.length) {
      classColorMap[className] = colors[index];
    } else {
      classColorMap[className] = `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0")}`;
    }
  });

  return classColorMap;
};

const Dashboard: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showMasks, setShowMasks] = useState<boolean>(true);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [classColors, setClassColors] = useState<Record<string, string>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
      setAnalysisResult(null);
      setClassColors({});
    }
  };

  useEffect(() => {
    if (analysisResult && analysisResult.classes) {
      const colorMap = generateClassColors(analysisResult.classes);
      setClassColors(colorMap);
    }
  }, [analysisResult]);

  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const drawPointsOnCanvas = async () => {
    if (
      !canvasRef.current ||
      !preview ||
      !analysisResult ||
      Object.keys(classColors).length === 0
    )
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const img = await loadImage(preview);

      canvas.width = img.width;
      canvas.height = img.height;
      setImageSize({ width: img.width, height: img.height });

      ctx.drawImage(img, 0, 0, img.width, img.height);

      if (
        showMasks &&
        analysisResult.masks &&
        analysisResult.masks.length > 0
      ) {
        analysisResult.masks.forEach((mask: number[][], index: number) => {
          if (
            mask.length > 0 &&
            analysisResult.classes &&
            index < analysisResult.classes.length
          ) {
            const className = analysisResult.classes[index];
            const color = classColors[className] || "#FF0000";

            const rgbaFill = color
              .replace("#", "rgba(")
              .replace(
                /([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i,
                (_, r, g, b) =>
                  `${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(
                    b,
                    16
                  )}, 0.3)`
              );
            const rgbaBorder = color
              .replace("#", "rgba(")
              .replace(
                /([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i,
                (_, r, g, b) =>
                  `${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(
                    b,
                    16
                  )}, 0.8)`
              );

            ctx.beginPath();
            ctx.moveTo(mask[0][0], mask[0][1]);

            for (let i = 1; i < mask.length; i++) {
              ctx.lineTo(mask[i][0], mask[i][1]);
            }
            ctx.closePath();
            ctx.fillStyle = rgbaFill;
            ctx.fill();

            ctx.strokeStyle = rgbaBorder;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      }

      if (showBoxes && analysisResult.boxes) {
        analysisResult.boxes.forEach((box: number[], index: number) => {
          if (analysisResult.classes && index < analysisResult.classes.length) {
            const x = box[0];
            const y = box[1];
            const width = box[2] - box[0];
            const height = box[3] - box[1];

            const className = analysisResult.classes[index];
            const color = classColors[className] || "#FF0000";

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            if (analysisResult.classes && analysisResult.confs) {
              const confidence = analysisResult.confs[index];

              ctx.fillStyle = color + "B3";
              ctx.fillRect(x, y - 20, 100, 20);
              ctx.fillStyle = "white";
              ctx.font = "12px Arial";
              ctx.fillText(
                `${className}: ${(confidence * 100).toFixed(1)}%`,
                x + 5,
                y - 5
              );
            }
          }
        });
      }
    } catch (err) {
      console.error("Error drawing on canvas:", err);
    }
  };

  useEffect(() => {
    if (preview && analysisResult && Object.keys(classColors).length > 0) {
      drawPointsOnCanvas();
    }
  }, [preview, analysisResult, showMasks, showBoxes, classColors]);

  const uploadAndAnalyze = async () => {
    if (!selectedFile) {
      setError("Пожалуйста, выберите файл");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("files", selectedFile);

    try {
      const uploadResponse = await axios.post(`${CLIENT_URL}/file/`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        withCredentials: true,
      });

      if (
        !uploadResponse.data ||
        !uploadResponse.data.files ||
        uploadResponse.data.files.length === 0
      ) {
        setError("Не удалось загрузить файл");
        setIsLoading(false);
        return;
      }

      const fileIds = uploadResponse.data.files;

      const predictResponse = await axios.post(
        `${MODEL_URL}/predict`,
        {
          files_id: fileIds,
        },
        {
          withCredentials: true,
        }
      );

      if (predictResponse.data) {
        const fileId = fileIds[0];
        if (predictResponse.data[fileId]) {
          setAnalysisResult(predictResponse.data[fileId]);

          try {
            const mediaFormData = new FormData();
            mediaFormData.append("file", selectedFile);
            mediaFormData.append("file_id", fileId);
          } catch (saveErr) {
            console.error("Ошибка при сохранении изображения:", saveErr);
          }
        } else {
          setError("Не удалось получить результаты анализа");
        }
      } else {
        setError("Неожиданный формат ответа");
      }
    } catch (err: any) {
      console.error("Error uploading and analyzing:", err);
      if (err.response && err.response.data) {
        setError(err.response.data.message || "Ошибка при анализе изображения");
      } else {
        setError("Ошибка при анализе изображения");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Анализ рентгенограмм
        </h1>

        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Загрузка изображения
          </h2>
          <div className="mb-4">
            <label
              htmlFor="file-upload"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Выберите рентгеновский снимок
            </label>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          {selectedFile && preview && (
            <div className="mt-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Предпросмотр:</p>
              <div
                className="border rounded-md p-2 overflow-hidden"
                style={{ maxWidth: "100%" }}
              >
                <img
                  src={preview}
                  alt="Preview"
                  className="max-w-full h-auto"
                />
              </div>
            </div>
          )}

          <button
            onClick={uploadAndAnalyze}
            disabled={!selectedFile || isLoading}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isLoading ? "Анализ..." : "Анализировать"}
          </button>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              {error}
            </div>
          )}
        </div>

        {analysisResult && (
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Результаты анализа
            </h2>

            <div className="flex flex-wrap gap-6 mb-6 items-center bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBoxes}
                    onChange={(e) => setShowBoxes(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ms-3 text-sm font-medium text-gray-700">
                    Рамки объектов
                  </span>
                </label>
              </div>
              <div className="flex items-center">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showMasks}
                    onChange={(e) => setShowMasks(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ms-3 text-sm font-medium text-gray-700">
                    Маски объектов
                  </span>
                </label>
              </div>

              {!showBoxes && !showMasks && (
                <div className="text-sm text-amber-600 ml-auto font-medium">
                  Включите маски или рамки для отображения найденных объектов
                </div>
              )}
            </div>

            <div
              className="border rounded-md p-2 overflow-hidden"
              style={{ maxWidth: "100%" }}
            >
              <canvas
                ref={canvasRef}
                style={{ maxWidth: "100%", height: "auto" }}
              />
            </div>

            {analysisResult.classes && analysisResult.classes.length > 0 && (
              <div className="mt-6 bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-800 mb-3">
                  Классы обнаруженных объектов:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.keys(classColors).map((className, index) => {
                    const color = classColors[className];

                    const count = analysisResult.classes.filter(
                      (c: string) => c === className
                    ).length;
                    return (
                      <div key={index} className="flex items-center space-x-2">
                        <div
                          className="w-4 h-4 rounded-sm"
                          style={{ backgroundColor: color }}
                        ></div>
                        <span className="text-sm text-gray-700">
                          {className}{" "}
                          <span className="text-gray-500">({count})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {analysisResult.masks && analysisResult.masks.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-gray-600">
                  Обнаружено областей: {analysisResult.masks.length}
                </p>
              </div>
            )}

            {analysisResult.classes.length > 0 ? (
              <div className="mt-3 text-sm text-gray-600">
                <p>{analysisResult.message}</p>
              </div>
            ) : (
              <div className="rounded-md bg-red-50 p-4 mt-2">
                <p className="text-ls text-red-700">Объекты не найдены</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
