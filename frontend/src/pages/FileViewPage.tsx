import React from 'react';
import { useParams, Link } from 'react-router-dom';

const FileViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <h1>Просмотр файла: {id}</h1>
      <Link to={`/files/${id}/convert`}>Конвертировать</Link>
    </>
  );
};

export default FileViewPage;
